import { createClient } from "@libsql/client";
import { serve } from "bun";
const ranged = ['wooden_bow','long_bow','haunted_bow','balista'];
let fighters = {};
let fights = {}

/* const turso = createClient({
	url: process.env.TURSO_DATABASE_URL,
	authToken: process.env.TURSO_AUTH_TOKEN,
}); */

const server = Bun.serve({
	port: 3000,
	fetch(request, server) {
		/* console.log(request.headers) */
		if (server.upgrade(request)) {
			return;
		}

		return new Response('Hello World!');
	},
	websocket: {
		open(ws) {
			console.log('Client connected');
		},
		message(ws, message) {
			console.log(`Received message: ${message}`);

			const messageString = typeof message === 'string' ? message : new TextDecoder().decode(message);

			handleMessage(ws, messageString);

		},
		close(ws) {
			if(fights[ws.channelId]) {endFight(ws.channelId, ws.username)};
			ws.unsubscribe(ws.channelId);
			delete fighters[ws.username];
			delete fighters[ws.enemyUsername];
			delete fights[ws.channelId];
			console.log('Client disconnected');
		}
	}
})

function handleMessage(ws, message) {
	let key;
	let value;
	let value_array;
	if (message.includes('=')) {
		[key, value] = message.split("=");
		if (value.includes('~')) {
			value_array = value.split('~');
		}
	} else {
		key = message;
	}

	switch (key) {
		case "User":
			const [user, enemy] = value_array.map(str => str.trim());
			const channelId = [user, enemy].sort().join('-'); 

			if(fighters[user]) {ws.close(); return;}

			fighters[user] = {
				channel:channelId,
				ws:ws
			};

			ws.username = user;
			ws.enemyUsername = enemy;
			ws.channelId = channelId;

			const userToken = getToken(user);
			ws.send('UserToken=' + userToken);

			ws.subscribe(channelId);

			if (!fights[channelId]) {
				fights[channelId] = {
					[user]: {
						username: user,
						enemyUsername: enemy,
						coldProtection: 0,
						extraLife: true,
						freeSpell: false,
						isInvisible: false,
						isReflecting: false,
						poisoned: false,
						cooldowns: {
							heal: 0,
							fire: 0,
							reflect: 0,
							invisibility: 0,
							pet: 0,
						}
					},
					[enemy]: {
						username: enemy,
						enemyUsername: user,
						coldProtection: 0,
						extraLife: true,
						freeSpell: false,
						isInvisible: false,
						isReflecting: false,
						poisoned: false,
						cooldowns: {
							heal: 0,
							fire: 0,
							reflect: 0,
							invisibility: 0,
							pet: 0,
						}
					},
					player1: user,
					player2: enemy,
					isRaining: false,
					rainCooldown: 0,
					time: 0,
				}
				return;
			}
			break;
		case "Config":
			if (!fights[ws.channelId].config) {
				fights[ws.channelId].config = JSON.parse(value);
			}
			break;
		case "SetPlayer":
			if(!fights[ws.channelId][ws.username].hp) {
				const parsedValue = JSON.parse(value);
				fights[ws.channelId][ws.username] = {...fights[ws.channelId][ws.username], ...parsedValue};
				checkCold(ws.channelId,ws.username);
				if(fights[ws.channelId][ws.enemyUsername].hp) {
					startFight(ws.channelId,ws.username,ws.enemyUsername);
				}
			}
			break;
		case "UpdateStats":
			fights[ws.channelId][ws.username][value_array[0]] = value_array[1];
			ws.publish(ws.channelId,"RefreshEnemy=" + JSON.stringify({[value_array[0]]:value_array[1]}))
			break;
		case "Cast":
			castSpell(ws.channelId,ws.username,ws.enemyUsername,value);
			break;
		case "Info":
			ws.send("Info=" + JSON.stringify(fights));
			break;
		case "UserInfo":
			ws.send("UserInfo=" + JSON.stringify(fighters));
			break;
	}
}

function updateStats(fightId) {
	const p1 = fights[fightId].player1
	const p2 = fights[fightId].player2
	const p1hp = fights[fightId][p1].hp
	const p2hp = fights[fightId][p2].hp
	const p1mana = fights[fightId][p1].mana
	const p2mana = fights[fightId][p2].mana
	server.publish(fightId,"UpdateStats=" + JSON.stringify({[p1]:{hp:p1hp,mana:p1mana},[p2]:{hp:p2hp,mana:p2mana}}))
}

//Cooldown Spell function
function spellCooldown(fightId,player,spellName,time) {
	if (fights[fightId]) {
		fights[fightId][player].cooldowns[spellName] = time
		if (time > 0) {
			setTimeout(function(){
				spellCooldown(fightId,player,spellName,time-1)
			},1000)
		}
	}
}

//Rain
function toggleRain(fightId){
	if (fights[fightId]) {
		fights[fightId].isRaining = !fights[fightId].isRaining
		if (fights[fightId].isRaining) {
			if(fights[fightId].config.mudRain) {
				server.publish(fightId,"Mud")
			} else {
				server.publish(fightId,"Rain")
			}
		} else {
			server.publish(fightId,"StopRain")
		}
		let interval = 10000
		if (fights[fightId].config.mudRain) {
			interval = fights[fightId].isRaining ? 5000 : 30000
		} else {
			interval = fights[fightId].isRaining ? 10000 : 20000
		}
		setTimeout(()=>{toggleRain(fightId)},interval)
	}
}

//Spell Casting Function
function castSpell(fightId,player,receiver,spellName) {
	if (fights[fightId]) {
		if (fights[fightId].config.noSpells || (fights[fightId].config.petAlly && fights[fightId][player].pet == "whiteBunny")) {
			server.publish(fightId,"HitSplat=IMMUNE~images/blocked.png~white~rgba(255,0,0,0.4)~blue~" + receiver)
			return
		}
		if (fights[fightId][player].cooldowns[spellName] == 0) {
			switch (spellName) {
				case "heal":
					if (fights[fightId][player].mana >= 2) {
						fights[fightId][player].mana -= 2;
						fights[fightId][player].hp += 3;
						fights[fightId][player].hp = Math.min(fights[fightId][player].hp,fights[fightId][player].maxHp);
						spellCooldown(fightId,player,spellName,5)
						updateStats(fightId)
						fighters[player].ws.send("SpellCooldown=" + spellName + "~" + 5 + "~" + "dpvp-fighting-spell-label-heal")
						server.publish(fightId,"HitSplat=3~images/heal_spell.png~lime~rgba(0,255,0,0.4)~blue~" + player)
					}
					break;
				case "fire":
					if (fights[fightId][player].mana >= 3) {
						fights[fightId][player].mana -= 3;
						let fireDamage = Math.floor(Math.random() * 6) + parseInt(fights[fightId][player].magicBonus);
						if (fights[fightId].config.fireWeakness == true) {
							fireDamage *= 2
						};
						fights[fightId][receiver].hp -= fireDamage
						spellCooldown(fightId,player,spellName,5)
						updateStats(fightId)
						fighters[player].ws.send("SpellCooldown=" + spellName + "~" + 5 + "~" + "dpvp-fighting-spell-label-fire")
						server.publish(fightId,"HitSplat="+fireDamage+"~images/fire_icon.png~white~rgba(255,0,0,0.4)~blue~" + receiver)
					}
					break;
				case "reflect":
					if (fights[fightId][player].mana >= 1 && fights[fightId][player].isReflecting == false) {
						fights[fightId][player].mana -= 1;
						fights[fightId][player].isReflecting = true;
						spellCooldown(fightId,player,spellName,30)
						fighters[player].ws.send("SpellCooldown=" + spellName + "~" + 30 + "~" + "dpvp-fighting-spell-label-reflect")
						server.publish(fightId,"Reflect=" + player)
					}
					break;
				case "invisibility":
					if (fights[fightId][player].mana >= 2) {
						fights[fightId][player].mana -= 2;
						fights[fightId][player].isInvisible = true;
						setTimeout(()=>{
							if(fights[fightId]) {
								fights[fightId][player].isInvisible = false
								server.publish(fightId,"Invisibility=" + player)
							}
						},4000)
						spellCooldown(fightId,player,spellName,30)
						fighters[player].ws.send("SpellCooldown=" + spellName + "~" + 30 + "~" + "dpvp-fighting-spell-label-invisibility")
						server.publish(fightId,"Invisibility=" + player)
					}
					break;
				case "pet":
					switch (fights[fightId][player].pet) {
						case "blackChicken":
							break;
						case "blueChicken":
							break;
						case "goldenChicken":
							break
						case "spirit":
							break
						case "whiteChicken":
							break
					}
					break;
			};
		}
	}
}

function poison(fightId,receiver) {
	if (fights[fightId]) {
		fights[fightId][receiver].hp -= 3;
		server.publish(fightId,"HitSplat=3~images/poison.png~green~rgba(255,0,0,0.4)~blue~" + receiver)
		updateStats(fightId)
		if (fights[fightId][receiver].hp > 0) {
			setTimeout(function(){poison(fightId,receiver)},4000)
		};
	}
}

function checkCold(fightId, checkedPlayer) {
	let cold = 0;
	const player = fights[fightId][checkedPlayer];
	['head','body','legs','gloves','boots'].forEach(slot => {
		if (player[slot].includes("frozen") || player[slot].includes("bear")) {
			cold += 1
		}
	})
	player.coldProtection = cold
}

//Start fight
function startFight(fightId,player1,player2) {
	server.publish(fightId,"Fight=" + JSON.stringify(fights[fightId]))
	setTimeout(()=>{
		attack(fightId,player1,player2)
		attack(fightId,player2,player1)
	},3000)
	
	fights[fightId].tick = setInterval(function() {
		tick(fightId)
	}, 1000)
	if (fights[fightId].config.itRains || fights[fightId].config.mudRain) {
		setTimeout(()=>{toggleRain(fightId)},10000)
	}
}
//Hit function
function hitRate(fightId,defence,accuracy) {
	if (accuracy == -1) {return false};
	let hitRandom = Math.random();
	let hitChance = 0;
	if (((defence / 2) - accuracy) > 4) {
		hitChance = 1 / (Math.max(1, ((defence / 2) - accuracy)) + 1);
	} else if (((defence / 2) - accuracy) <= 0) {
		hitChance = 1;
	} else {
		hitChance = 1 - (((defence / 2) - accuracy) * 2 / 10);
	};
	if (fights[fightId].config.darkness) {hitChance = 0.5};
	return hitRandom <= hitChance
}

//Attack function 
function attack(fightId,attacker,receiver){
	if (fights[fightId]) {
		//Poison
		if (fights[fightId][receiver].poisoned == false && fights[fightId][attacker].weapon.includes('poison')) {
			fights[fightId][receiver].poisoned = true;
			server.publish(fightId,"Poison=" + receiver)
			poison(fightId,receiver);
		};
		//If hit succeed 
		if (hitRate(fightId,fights[fightId][receiver].defence,fights[fightId][attacker].accuracy)) {
			if (fightId,fights[fightId][receiver].isInvisible) {
				server.publish(fightId,"HitSplat=MISSED~images/ghost_icon.png~white~rgba(255,0,0,0.6)~blue~" + receiver)
			} else {
				if (fights[fightId].config.defender) {
					fights[fightId][attacker].hp -= 1
					server.publish(fightId,"HitSplat=1~images/skeleton_defender.png~white~rgba(255,0,0,0.6)~blue~" + attacker)
				}
				if (ranged.includes(fights[fightId][attacker].weapon)) {
					if (fights[fightId].config.noRanged) {
						server.publish(fightId,"HitSplat=IMMUNE~images/blocked.png~white~rgba(255,0,0,0.4)~blue~" + receiver)
					} else {
						let damageDone = Math.floor(Math.random() * parseInt(fights[fightId][attacker].arrowDamage));
						if ((fights[fightId].config.fireWeakness && fights[fightId][attacker].arrows == 'fire_arrows') || (fights[fightId].config.iceWeakness == true && fights[fightId][attacker].arrows == 'ice_arrows')) {
							damageDone *= 2;
						}
						if (fights[fightId][receiver].isReflecting == true && damageDone > 0) {
							fights[fightId][attacker].hp -= damageDone;
							fights[fightId][receiver].isReflecting = false;
							server.publish(fightId,"HitSplat=" + damageDone + "~images/reflect_spell.png~white~rgba(255,0,0,0.6)~blue~" + attacker)
						} else {
							fights[fightId][receiver].hp -= damageDone;
							server.publish(fightId,"HitSplat=" + damageDone + "~images/reflect_spell.png~white~rgba(255,0,0,0.6)~blue~" + receiver)
						}
					};
				} else {
					let damageDone = Math.floor(Math.random() * parseInt(fights[fightId][attacker].damage))
					if (fights[fightId].config.area == "mansion") {
						if (fights[fightId][attacker].weapon == 'scythe') {damageDone *= 2};
						if (fights[fightId][attacker].weapon == 'double_scythe') {damageDone *= 4};
					} else if (fights[fightId].config.area == "beach") {
						if (fights[fightId][attacker].weapon.includes('trident')) {damageDone *= 2};
					};
					if (fights[fightId][receiver].isReflecting && damageDone > 0) {
						fights[fightId][attacker].hp -= damageDone;
						fights[fightId][receiver].isReflecting = false;
						server.publish(fightId,"Reflect=" + receiver)
						server.publish(fightId,"HitSplat=" + damageDone + "~images/reflect_spell.png~white~rgba(255,0,0,0.6)~blue~" + attacker)
					} else {
						fights[fightId][receiver].hp -= damageDone;
						server.publish(fightId,"HitSplat=" + damageDone + "~images/" + fights[fightId][attacker].weapon + ".png~white~rgba(255,0,0,0.6)~blue~" + receiver)
					};
				};
			}
		} else {
			server.publish(fightId,"HitSplat=0~images/blocked.png~white~rgba(255,0,0,0.6)~blue~" + receiver)
		};
		//Update stats
		updateStats(fightId)
		//Attack again
		setTimeout(function(){attack(fightId,attacker,receiver)},(7-fights[fightId][attacker].speed)*1000)
	}
}

//Evething that should be called each second
function tick(fightId) {
	if (fights[fightId]) {
		[fights[fightId].player1,fights[fightId].player2].forEach((player) => {
			if (fights[fightId][player].hp <= 0) {
				if (fights[fightId][player].extraLife) {
					fights[fightId][player].hp = 1;
					fights[fightId][player].extraLife = false;
					updateStats(fightId)
				} else {
					endFight(fightId,player);
				}
			};
			if (fights[fightId].config.coldDay) {
				fights[fightId][player].hp -= 5 - fights[fightId][player].coldProtection;
				server.publish(fightId,"HitSplat=5~images/snowflake_sigil.png~cyan~rgba(255,0,0,0.4)~blue~0" + player)
			}
			if (fights[fightId].isRaining) {
				if (fights[fightId].config.mudRain && fights[fightId].time % 5 == 4) {
					if (!fights[fightId][player].isInvisible) {
						fights[fightId][player].hp -= 15
						server.publish(fightId,"HitSplat=15~images/guardian_rain_hitsplat.png~white~rgba(255,0,0,0.6)~blue~" + player)
						updateStats(fightId)
					} else {
						server.publish(fightId,"HitSplat=MISSED~images/ghost_icon.png~white~rgba(255,0,0,0.6)~blue~" + player)
					}
				} else {
					if (fights[fightId][player].amulet == 'rain_amulet') {
						fights[fightId][player].hp += 1
						server.publish(fightId,"HitSplat=1~images/heal_spell.png~lime~rgba(0,255,0,0.4)~blue~" + player)
						updateStats(fightId)
					}
				}
			}
		})
		fights[fightId].time++
	}
}

async function looting(winner) {
	/* let user = await turso.execute('SELECT (coins, wins) FROM players WHERE name = ?', [winner])
	if (user.rows.length > 0) {
		await turso.execute('UPDATE players SET (coins, wins) = (?, ?) WHERE name = ?', [user.rows[0].coins + 1, user.rows[0].wins + 1, winner]);
	} else {
		await turso.execute('INSERT INTO players (name, coins, pets, wins, titles) VALUES (?, ?, ?, ?, ?)', [winner, 1, '', 1, '']);
	} */
	fighters[winner].ws.send('Win');
	//websocket to update coins
}

function endFight(fightId, player) {
	clearInterval(fights[fightId].tick);

	const looser = fights[fightId][player].username
	const winner = fights[fightId][player].enemyUsername
	
	looting(winner)
	fighters[looser].ws.send('Lose');

	fighters[winner].ws.close();
	fighters[looser].ws.close();
	delete fighters[winner];
	delete fighters[looser];

	delete(fights[fightId])
}

function getToken(user) {
    let hash = 0;

    for (let i = 0; i < user.length; i++) {
        const char = user.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }

    return hash.toString(36);
}

console.log(`Server running at http://localhost:${server.port}`)