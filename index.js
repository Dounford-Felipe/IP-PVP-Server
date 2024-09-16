import { createClient } from "@libsql/client";
import { serve } from "bun";
const ranged = ['wooden_bow','long_bow','haunted_bow','balista'];
let fighters = {};
let fights = {}
const manaCost = {
	heal: 2,
	fire: 3,
	reflect: 1,
	invisibility: 2,
	pet: 5
};
const spellCooldowns = {
	heal: 5,
	fire: 5,
	reflect: 30,
	invisibility: 30,
	pet: 15
}
const intStats = ["damage", "arrowDamage","speed","defence", "accuracy","magicBonus","maxHp","maxMana","hp","mana"];
const armorSlots = ['head','body','legs','gloves','boots'];

const turso = createClient({
	url: process.env.TURSO_DATABASE_URL,
	authToken: process.env.TURSO_AUTH_TOKEN,
});

const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 7830,
	fetch(request, server) {
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
			const messageString = typeof message === 'string' ? message : new TextDecoder().decode(message);

			handleMessage(ws, messageString);

		},
		close(ws) {
			if (ws.isDebug) return;
			clearInterval(fights[ws.channelId].tick);
			ws.unsubscribe(ws.channelId);
			delete fighters[ws.username];
			if (fighters[ws.enemyUsername]) {
				fighters[ws.enemyUsername].ws.close();
			} else {
				delete fights[ws.channelId];
			}
			console.log('Client disconnected');
		}
	}
})

async function handleMessage(ws, message) {
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

			const ban = await import('./ban.json');

			if (ban.users.includes(user)) {
				ws.close();
				if(fights[channelId]) {fighters[enemy].ws.close();};
				return;
			}

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
						bonusSpeed: 0,
						bonusAccuracy: 0,
						bonusDamage: 0,
						bonusDefence: 0,
						dodgeChance: 0,
						spellFail: 0,
						spellBonus: 0,
						attackFail: 0,
						burnEffect: 0,
						spellReduction: 0,
						extraLife: 1,
						afterDeathHP: 1,
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
						bonusSpeed: 0,
						bonusAccuracy: 0,
						bonusDamage: 0,
						bonusDefence: 0,
						dodgeChance: 0,
						spellFail: 0,
						spellBonus: 0,
						attackFail: 0,
						burnEffect: 0,
						spellReduction: 0,
						extraLife: 1,
						afterDeathHP: 1,
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
				if (fights[ws.channelId].config.petAlly) {
					const player = fights[ws.channelId][ws.username];
					switch (player.pet) {
						case "bamboo":
							const newHP = player.petLevel == 3 ? 15 : player.petLevel == 2 ? 10 : 5;
							player.afterDeathHP += newHP;
							player.hp -= newHP;
							player.maxHp -= newHP;
							break;
						case "blackCat":
							const fail = player.petLevel == 3 ? 0.5 : player.petLevel == 2 ? 0.25 : 0.15;
							player.spellFail = fail;
							player.spellBonus = player.petLevel;
							break;
						case "blueChicken":
							const reduction = player.petLevel == 3 ? 0.2 : player.petLevel == 2 ? 0.15 : 0.1;
							player.spellReduction += reduction;
							break;
						case "blueMushroom":
							const attackFail = player.petLevel == 3 ? 0.5 : player.petLevel == 2 ? 0.25 : 0.15;
							player.attackFail = attackFail;
							break;
						case "calicoCat":
							const extraHP = player.petLevel == 3 ? 5 : 0
							player.hp += extraHP;
							player.maxHp += extraHP;
							break;
						case "fireSpirit":
							player.burnEffect = player.petLevel
							break;
						case "greenMushroom":
							player.extraLife += 1;
							break;
						case "horse":
							const newSpeed = player.petLevel == 3 ? 1 : player.petLevel == 2 ? 0.5 : 0.25;
							player.bonusSpeed += newSpeed;
							break;
						case "purpleJay":
							const newDodge = player.petLevel == 3 ? 0.1 : player.petLevel == 2 ? 0.075 : 0.05;
							player.dodgeChance += newDodge;
							break;
						case "whiteCat":
							player.hp += 1;
							player.maxHp += 1;
							player.bonusDamage += player.petLevel >= 2 ? 1 : 0;
							player.bonusDefence += player.petLevel == 3 ? 1 : 0;
							player.bonusAccuracy += player.petLevel == 3 ? 1 : 0;
							break;
					}
				}
				if(fights[ws.channelId][ws.enemyUsername].hp) {
					startFight(ws.channelId,ws.username,ws.enemyUsername);
				}
			}
			break;
		case "UpdateStats":
			if (intStats.includes(value_array[0])) {
				value_array[1] = parseInt(value_array[1]);
			}
			fights[ws.channelId][ws.username][value_array[0]] = value_array[1];
			server.publish(ws.channelId,"RefreshPlayer=" + value_array[0] + "~" + value_array[1] + "~" + ws.username);
			if (armorSlots.includes(value_array[0])) {
				checkCold(ws.channelId,ws.username);
			}
			break;
		case "Cast":
			castSpell(ws.channelId,ws.username,ws.enemyUsername,value);
			break;
		case "Debug":
			ws.isDebug = true;
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

//
function checkSuccess(value) {
	if (value === 0) return false
	const random = Math.random()
	return random <= value
}

//Cooldown Spell function
function spellCooldown(fightId,player,spellName,time) {
	if (fights[fightId]) {
		fights[fightId][player].cooldowns[spellName] = Math.max(0,time)
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
			if (fights[fightId][player].mana < manaCost[spellName]) {return}
			//It has 15, 25 or 50% chance to fail
			if(checkSuccess(fights[fightId][player].spellFail)) {
				fights[fightId][player].mana -= manaCost[spellName];
				server.publish(fightId,"HitSplat=MISSED~images/ghost_icon.png~white~rgba(255,0,0,0.6)~blue~" + receiver)
				updateStats(fightId)
				spellCooldown(fightId,player,spellName,spellCooldowns[spellName])
				fighters[player].ws.send("SpellCooldown=" + spellName + "~" + spellCooldowns[spellName])
				return
			}
			let spellTimer = 0;
			switch (spellName) {
				case "heal":
					fights[fightId][player].mana -= 2;
					const healAmount = 3 + fights[fightId][player].spellBonus;
					fights[fightId][player].hp += healAmount;
					fights[fightId][player].hp = Math.min(fights[fightId][player].hp,fights[fightId][player].maxHp);
					spellTimer = 5 - (5 * fights[fightId][player].spellReduction);
					server.publish(fightId,"HitSplat=" + healAmount + "~images/heal_spell.png~lime~rgba(0,255,0,0.4)~blue~" + player)
					break;
				case "fire":
					fights[fightId][player].mana -= 3;
					const fireAmount = 6 + fights[fightId][player].spellBonus;
					let fireDamage = Math.floor(Math.random() * fireAmount) + parseInt(fights[fightId][player].magicBonus) + Math.sign(fights[fightId][player].burnEffect);
					if (fights[fightId].config.fireWeakness == true) {
						fireDamage *= 2
					};
					fights[fightId][receiver].hp -= fireDamage
					spellTimer = 5 - (5 * fights[fightId][player].spellReduction);
					server.publish(fightId,"HitSplat="+fireDamage+"~images/fire_icon.png~white~rgba(255,0,0,0.4)~blue~" + receiver)
					break;
				case "reflect":
					if (!fights[fightId][player].isReflecting) {
						fights[fightId][player].mana -= 1;
						fights[fightId][player].isReflecting = true;
						spellTimer = 30 - (30 * fights[fightId][player].spellReduction);
						server.publish(fightId,"Reflect=" + player)
					}
					break;
				case "invisibility":
					fights[fightId][player].mana -= 2;
					fights[fightId][player].isInvisible = true;
					setTimeout(()=>{
						if(fights[fightId]) {
							fights[fightId][player].isInvisible = false
							server.publish(fightId,"Invisibility=" + player)
						}
					},4000)
					spellTimer = 30 - (30 * fights[fightId][player].spellReduction);
					server.publish(fightId,"Invisibility=" + player)
					break;
				case "pet":
					if (!fights[fightId].config.petAlly) {return}
					fights[fightId][player].mana -= 5;
					spellTimer = 15
					switch (fights[fightId][player].pet) {
						case "blackChicken":
							if (fights[fightId][player].petLevel == 1) {
								spellTimer = 9999
							} else if (fights[fightId][player].petLevel == 2) {
								fights[fightId][player].hp += 5;
								spellTimer = 9999
								server.publish(fightId,"HitSplat=MONSTER!!!~images/heal_spell.png~lime~rgba(0,255,0,0.4)~blue~" + player)
								unlockTitle(player, "monster")
							} else {
								fights[fightId][receiver].hp -= 5;
								server.publish(fightId,"HitSplat=5~images/black_medalion.png~white~rgba(255,0,0,0.6)~blue~" + receiver)
							}
							break;
						case "goldenChicken":
							const goldenPower = 2 + fights[fightId][player].petLevel
							fights[fightId][player].hp += goldenPower;
							fights[fightId][receiver].hp -= goldenPower;
							server.publish(fightId,"HitSplat=" + goldenPower + "~images/heal_spell.png~lime~rgba(0,255,0,0.4)~blue~" + player)
							server.publish(fightId,"HitSplat=" + goldenPower + "~https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/goldenEgg.png~white~rgba(255,0,0,0.6)~blue~" + receiver)
							break
						case "spirit":
							const spiritPower = 1 + (fights[fightId][player].petLevel * 2)
							fights[fightId][receiver].hp -= spiritPower
							server.publish(fightId,"HitSplat=" + spiritPower + "~images/undead_staff_spirit.png~white~rgba(255,0,0,0.6)~blue~" + receiver)
							break
						case "whiteChicken":
							const chickenPower = fights[fightId][player].petLevel
							fights[fightId][receiver].hp -= chickenPower
							server.publish(fightId,"HitSplat=" + chickenPower + "~images/breeding_chicken_egg.png~white~rgba(255,0,0,0.6)~blue~" + receiver)
							break
					}
					break;
			};
			updateStats(fightId)
			spellCooldown(fightId,player,spellName,spellTimer)
			fighters[player].ws.send("SpellCooldown=" + spellName + "~" + spellTimer)
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
	armorSlots.forEach(slot => {
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
		fights[fightId].tick = setInterval(function() {
			tick(fightId)
		}, 1000)
		attack(fightId,player1,player2)
		attack(fightId,player2,player1)
	},3000)
	
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
		//Attack fail
		if(checkSuccess(fights[fightId][attacker].attackFail) || checkSuccess(fights[fightId][receiver].dodgeChance)) {
			server.publish(fightId,"HitSplat=MISSED~images/ghost_icon.png~white~rgba(255,0,0,0.6)~blue~" + receiver)
		} else {
			//Poison
			if (fights[fightId][receiver].poisoned == false && fights[fightId][attacker].weapon.includes('poison')) {
				fights[fightId][receiver].poisoned = true;
				server.publish(fightId,"Poison=" + receiver)
				poison(fightId,receiver);
			};
			//If hit succeed 
			if (hitRate(fightId,fights[fightId][receiver].defence + fights[fightId][receiver].bonusDefence,fights[fightId][attacker].accuracy + fights[fightId][attacker].bonusAccuracy)) {
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
							let damageDone = Math.floor(Math.random() * (fights[fightId][attacker].arrowDamage + fights[fightId][attacker].bonusDamage) + (fights[fightId][attacker].arrowDamage * fights[fightId][attacker].attackFail)) + fights[fightId][attacker].burnEffect;
							if ((fights[fightId].config.fireWeakness && fights[fightId][attacker].arrows == 'fire_arrows') || (fights[fightId].config.iceWeakness == true && fights[fightId][attacker].arrows == 'ice_arrows')) {
								damageDone *= 2;
							}
							if (fights[fightId][receiver].isReflecting && damageDone > 0) {
								fights[fightId][attacker].hp -= damageDone;
								fights[fightId][receiver].isReflecting = false;
								server.publish(fightId,"HitSplat=" + damageDone + "~images/reflect_spell.png~white~rgba(255,0,0,0.6)~blue~" + attacker)
							} else {
								fights[fightId][receiver].hp -= damageDone;
								server.publish(fightId,"HitSplat=" + damageDone + "~images/" + fights[fightId][attacker].weapon + ".png~white~rgba(255,0,0,0.6)~blue~" + receiver)
							}
						};
					} else {
						let meleeDamage = 0;
						let meleeText = ""
						function meleeAttack(){
							let damageDone = Math.floor(Math.random() * (fights[fightId][attacker].damage + fights[fightId][attacker].bonusDamage) + (fights[fightId][attacker].damage * fights[fightId][attacker].attackFail)) + fights[fightId][attacker].burnEffect;
							if (fights[fightId].config.area == "mansion") {
								if (fights[fightId][attacker].weapon == 'scythe') {damageDone *= 2};
								if (fights[fightId][attacker].weapon == 'double_scythe') {damageDone *= 4};
							} else if (fights[fightId].config.area == "beach") {
								if (fights[fightId][attacker].weapon.includes('trident')) {damageDone *= 2};
							};
							return damageDone
						}
						if (fights[fightId][attacker].weapon.includes("stinger_dagger")) {
							const d1 = meleeAttack();
							const d2 = meleeAttack();
							const d3 = meleeAttack();
							meleeDamage = d1 + d2 + d3;
							meleeText = d1 + ", " + d2 + ", " + d3
						} else {
							meleeDamage = meleeText = meleeAttack();
						}
						if (fights[fightId][receiver].isReflecting && meleeDamage > 0) {
							fights[fightId][attacker].hp -= meleeDamage;
							fights[fightId][receiver].isReflecting = false;
							server.publish(fightId,"Reflect=" + receiver)
							server.publish(fightId,"HitSplat=" + meleeText + "~images/reflect_spell.png~white~rgba(255,0,0,0.6)~blue~" + attacker)
						} else {
							fights[fightId][receiver].hp -= meleeDamage;
							server.publish(fightId,"HitSplat=" + meleeText + "~images/" + fights[fightId][attacker].weapon + ".png~white~rgba(255,0,0,0.6)~blue~" + receiver)
						};
					};
				}
			} else {
				server.publish(fightId,"HitSplat=0~images/blocked.png~white~rgba(255,0,0,0.6)~blue~" + receiver)
			};
			updateStats(fightId)
		}
		//Update stats
		//Attack again
		const newSpeed = Math.max(1, 7 - (fights[fightId][attacker].speed + fights[fightId][attacker].bonusSpeed))
		setTimeout(function(){attack(fightId,attacker,receiver)},newSpeed*1000)
	}
}

//Evething that should be called each second
function tick(fightId) {
	if (fights[fightId]) {
		if (fights[fightId].ended) {
			clearInterval(fights[fightId].tick);
			return
		}
		[fights[fightId].player1,fights[fightId].player2].forEach((player) => {
			if (fights[fightId][player].hp <= 0) {
				if (fights[fightId][player].extraLife) {
					fights[fightId][player].hp = fights[fightId][player].afterDeathHP;
					fights[fightId][player].extraLife -= 1;
					updateStats(fightId)
				} else {
					console.log("Player " + player + " died");
					fights[fightId].ended = true;
					endFight(fightId,player);
				}
			};
			if (fights[fightId].config.coldDay) {
				const coldDamage = 5 - fights[fightId][player].coldProtection;
				if (coldDamage === 0) return
				fights[fightId][player].hp -= coldDamage
				server.publish(fightId,"HitSplat=" + coldDamage + "~images/snowflake_sigil.png~cyan~rgba(255,0,0,0.4)~blue~" + player)
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
					if (fights[fightId][player].amulet == 'amulet_of_healing_rain') {
						fights[fightId][player].hp += 3
						fights[fightId][player].hp = Math.min(fights[fightId][player].hp,fights[fightId][player].maxHp);
						server.publish(fightId,"HitSplat=1~images/heal_spell.png~lime~rgba(0,255,0,0.4)~blue~" + player)
						updateStats(fightId)
					}
				}
			}
		})
		fights[fightId].time++
		if (fights[fightId].time > 600) {
			server.publish(fightId,"FightResult=Draw")
			fights[fightId].ended = true;
			fighters[fights[fightId].player1].ws.close()
		}
	}
}

async function looting(fightId, winner, loser) {
	try {
		fighters[winner].ws.send('FightResult=Winner');

		const user = await turso.execute('SELECT * FROM players WHERE name = ?', [winner]);
		const titles = JSON.parse(user.rows[0].titles);
		const wins = user.rows[0].wins
		//websocket to update coins
		await turso.execute('UPDATE players SET coins = coins + 1 WHERE name = ?', [winner]);
		await turso.execute('UPDATE players SET wins = wins + 1 WHERE name = ?', [winner]);

		//Gives pet xp
		const pet = fights[fightId][winner].pet
		if (pet !== "none") {
			const query = `UPDATE petsInfo SET ${pet} = ${pet} + 1 WHERE name = ?`;
			await turso.execute(query, [winner]);
		}

		if ((loser === "i am smitty" || loser === "smitty is me") && !titles.includes('bossSlayer')) {
			unlockTitle(winner, 'bossSlayer', user);
		}
		if (wins == 9) {
			unlockTitle(winner, 'apprentice', user);
		} else if (wins == 24 ) {
			unlockTitle(winner, 'expert', user);
		} else if (wins == 49) {
			unlockTitle(winner, 'champion', user);
		} else if (wins == 99) {
			unlockTitle(winner, 'legend', user);
		} else if (wins == 149) {
			unlockTitle(winner, 'immortal', user);
		}
	} catch (error) {
		console.log(error.message, "looting", fightId, winner, loser)
	}
}

async function endFight(fightId, loser) {
	const winner = fights[fightId][loser].enemyUsername
	
	await looting(fightId, winner, loser)
	fighters[loser].ws.send('FightResult=Loser');

	fighters[winner].ws.close();
}

async function unlockTitle(player, title, json) {
	const user = typeof json !== 'undefined' ? json : await turso.execute('SELECT * FROM players WHERE name = ?', [player]);
	const titles = JSON.parse(user.rows[0].titles);

	if (titles.includes(title)) {return}

	await turso.execute('UPDATE players SET titles = ? WHERE name = ?', [JSON.stringify([...titles, title]), player]);
	
	fighters[player].ws.send('NewTitle=' + title);
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