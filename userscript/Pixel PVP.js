// ==UserScript==
// @name         Pixel PVP Plus
// @version      1.0.0
// @description  PVP plugin for IdlePixel
// @author       Dounford
// @license      MIT
// @match        *://idle-pixel.com/login/play*
// @grant        none
// @require      https://greasyfork.org/scripts/441206-idlepixel/code/IdlePixel+.js
// @require      https://greasyfork.org/scripts/506089-ip-dounford-scripts-styles/code/IP%20Dounford%20Scripts%20Styles.js
// @require      https://greasyfork.org/scripts/488260-pixelshop/code/pixelshop.js
// ==/UserScript==
 
const imagePath = "https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/";
let pvpWebSocket;
let userToken = "";
let username = "";
let boughtPets = [];
let coins = 0;
let titles = [];
let wins = 0;
let currentTitle = "";
let currentPet = "none";
let fightHistory = [];
let enemyAvatar = "";
let heroAvatar = "";
let pets = {
	bamboo: {
		name: "Bamboo",
		level: 0,
		xp: 0
	},
	blackCat: {
		name: "Black Cat",
		level: 0,
		xp: 0
	},
	blackChicken: {
		name: "Black Chicken",
		level: 0,
		xp: 0
	},
	blueChicken: {
		name: "Blue Chicken",
		level: 0,
		xp: 0
	},
	blueMushroom: {
		name: "Blue Mushroom",
		level: 0,
		xp: 0
	},
	calicoCat: {
		name: "Calico Cat",
		level: 0,
		xp: 0
	},
	fireSpirit: {
		name: "Fire Spirit",
		level: 0,
		xp: 0
	},
	goldenChicken: {
		name: "Golden Chicken",
		level: 0,
		xp: 0
	},
	greenMushroom: {
		name: "Green Mushroom",
		level: 0,
		xp: 0
	},
	horse: {
		name: "Horse",
		level: 0,
		xp: 0
	},
	purpleJay: {
		name: "Purple Jay",
		level: 0,
		xp: 0
	},
	spirit: {
		name: "Spirit",
		level: 0,
		xp: 0
	},
	whiteBunny: {
		name: "White Bunny",
		level: 0,
		xp: 0
	},
	whiteCat: {
		name: "White Cat",
		level: 0,
		xp: 0
	},
	whiteChicken: {
		name: "White Chicken",
		level: 0,
		xp: 0
	},
	whyChicken: {
		name: "Why Chicken",
		level: 0,
		xp: 0
	}
};
const manaCost = {
	heal: 2,
	fire: 3,
	reflect: 1,
	invisibility: 2
};

(function() {
	'use strict';
 
	class pvpPlugin extends IdlePixelPlusPlugin {
		constructor() {
			super("pvp", {
				about: {
					name: GM_info.script.name,
					version: GM_info.script.version,
					author: GM_info.script.author,
					description: GM_info.script.description
				},
				config: [
					{
						id: "blockFights",
						label: "Reject all Fights and Friends requests",
						type: "boolean",
						default: false
					}
				]
			});
			this.heroContext;
			this.enemyContext;
			this.fight = {};
			this.fighting = false;
			this.blockAll = false;
			this.blockedUsers = [];
			this.currentEnemy = "";
			this.fightHitplat = {};
			this.options = {
				petAlly: true,
				coldDay: false,
				defender: false,
				fireWeakness: false,
				iceWeakness: false,
				area: "fields",
				itRains: false,
				mudRain: false,
				noRanged: false,
				noSpells: false,
				darkness: false,
			}
		}
		
		onLogin() {
			username = IdlePixelPlus.getVar("username");
			userToken = localStorage.getItem("dPVP-" + username + "Token") || "";
			const users = localStorage.getItem('dPVP-BlockedUsers');
			if (users) {
				this.blockedUsers = JSON.parse(users)
				this.blockedUsers.forEach((user) => {this.blockPlayer(user)})
			}
			const petStorage = localStorage.getItem("dPVP-" + username + "pets");
			if (petStorage) {
				pets = JSON.parse(petStorage);
			}
			this.getData().then(() => {				
				this.shopInit();
			})
			const historyString = localStorage.getItem("dPVP-" + username + "fightHistory");
			if (historyString) {
				fightHistory = JSON.parse(historyString);
				fightHistory.forEach((fight) => {
					IdlePixelPlus.plugins.pvp.addFightHistory(fight);
				});
			}
			const newTitle = localStorage.getItem("dPVP-" + username + "currentTitle") || "";
			this.changeTitle(newTitle);
			IdlePixelPlus.plugins.pvp.changeaddFriendFunction()
			this.addUI();
		}

		onConfigsChanged() {
			this.blockAll = this.getConfig("blockFights");
		}
 
		onCustomMessageReceived(player, content, callbackId) {
			console.log(content)
            if(content.startsWith("friendRequest")) {
				if (this.blockAll == false && !this.blockedUsers.includes(player)) {
					this.receiveFR(player);
				}
            };
			if(content.startsWith("pvpR:")) {
				if (this.fighting == false && this.blockAll == false && !this.blockedUsers.includes(player)) {
					this.receivePVPRequest(player,content.slice(5))
				}
			};
			if(content.startsWith("pvpAccept:")) {
				if (this.fighting == false && this.currentEnemy == player) {
					this.fighting = true;
					this.connectWebSocket()
				}
			}
        }
 
		onVariableSet(key, valueBefore, valueAfter) {
			if (!this.fighting) return;
			switch(key) {
				case "accuracy":
				case "speed":
				case "defence":
				case "head":
				case "body":
				case "legs":
				case "boots":
				case "gloves":
				case "amulet":
				case "shield":
				case "weapon":
				case "arrows":
					this.sendNewStats(key, valueAfter);
					break;
				case "melee_damage":
					this.sendNewStats("damage", valueAfter);
					break;
				case "arrow_damage":
					this.sendNewStats("arrowDamage", valueAfter);
					break;
				case "magic_bonus":
					this.sendNewStats("magicBonus", valueAfter);
					break;
			}
		}

		sendNewStats(stats, value) {
			pvpWebSocket.send("UpdateStats=" + stats + "~" + value);
		}

		async getData() {
			try {
				const response = await fetch("https://idle-pixel-pvp.vercel.app/player?name=" + username);
				const Json = await response.json();
				boughtPets = Json.pets.split(",");
				coins = Json.coins;
				titles = Json.titles.split(",");
				wins = Json.wins;

				boughtPets.forEach((pet) => {
					document.getElementById("dpvp" + pet).style.display = "";
				})
				titles.forEach((title) => {
					document.getElementById("dpvp" + title).style.display = "";
				})
			} catch (error) {
				console.error(error.message);
			}

			try {
				const response = await fetch("https://idle-pixel-pvp.vercel.app/petInfo?name=" + username);
				const Json = await response.json();
				if (Json == "none") return;

				for (let pet in pets) {
					pets[pet].xp = Json[pet].xp;
					pets[pet].level = Json[pet].level < 10 ? 1 : Json[pet].level < 25 ? 2 : 3;
				}
			} catch (error) {
				console.error(error.message);
			}
		}

		buyPet(petName) {
			fetch("https://idle-pixel-pvp.vercel.app/pets", {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({name: username, pet: petName, token: userToken})
			}).then((response) => {
				return response.json();
			})
		}

		equipPet() {
			const pet = document.getElementById('pvpPetName').value;
			currentPet = pet;
		}

		shopInit() {
			const moonCoins = {
				name: "Moon Coins",
				image: imagePath + "moonCoins.png",
				value: coins
			}
			PixelShopPlus.newCoin(moonCoins);
			PixelShopPlus.newShop('PVP','Moon Coins',this.buyPet);

			let pets = [
				{
					name:"blackCat",
					imageUrl: imagePath + "blackCat.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "Black Cat",
					buyText: "Buy Black Cat",
					boughtText: "Black Cat will be your friend forever",
				},
				{
					name:"whiteCat",
					imageUrl: imagePath + "whiteCat.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "White Cat",
					buyText: "Buy White Cat",
					boughtText: "White Cat will be your friend forever",
				},
				{
					name:"calicoCat",
					imageUrl: imagePath + "calicoCat.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "Calico Cat",
					buyText: "Buy Calico Cat",
					boughtText: "Calico Cat will be your friend forever",
				},
				{
					name:"whiteChicken",
					imageUrl: imagePath + "whiteChicken.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "White Chicken",
					buyText: "Buy White Chicken",
					boughtText: "White Chicken will be your friend forever",
				},
				{
					name:"blackChicken",
					imageUrl: imagePath + "blackChicken.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "Black Chicken",
					buyText: "Buy Black Chicken",
					boughtText: "Black Chicken will be your friend forever",
				},
				{
					name: "blueChicken",
					imageUrl: imagePath + "blueChicken.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "Blue Chicken",
					buyText: "Buy Blue Chicken",
					boughtText: "Blue Chicken will be your friend forever",
				},
				{
					name: "goldenChicken",
					imageUrl: imagePath + "goldenChicken.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "Golden Chicken",
					buyText: "Buy Golden Chicken",
					boughtText: "Golden Chicken will be your friend forever",
				},
				{
					name: "blueMushroom",
					imageUrl: imagePath + "blueMushroom.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "Blue Mushroom",
					buyText: "Buy Blue Mushroom",
					boughtText: "Blue Mushroom will be your friend forever",
				},
				{
					name: "greenMushroom",
					imageUrl: imagePath + "greenMushroom.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "Green Mushroom",
					buyText: "Buy Green Mushroom",
					boughtText: "Green Mushroom will be your friend forever",
				},
				{
					name: "spirit",
					imageUrl: imagePath + "spirit.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "Spirit",
					buyText: "Buy Spirit",
					boughtText: "Spirit will be your friend forever",
				},
				{
					name: "fireSpirit",
					imageUrl: imagePath + "fireSpirit.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "Fire Spirit",
					buyText: "Buy Fire Spirit",
					boughtText: "Fire Spirit will be your friend forever",
				},
				{
					name: "purpleJay",
					imageUrl: imagePath + "purpleJay.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "Purple Jay",
					buyText: "Buy Purple Jay",
					boughtText: "Purple Jay will be your friend forever",
				},
				{
					name: "whiteBunny",
					imageUrl: imagePath + "whiteBunny.png",
					coin: "Moon Coins",
					price: 10,
					tooltipText: "White Bunny",
					buyText: "Buy White Bunny",
					boughtText: "White Bunny will be your friend forever",
				}
			]

			pets = pets.filter((pet)=>{
				if (!boughtPets.includes(pet.name)) {
					return pet
				}
			})

			PixelShopPlus.newItems("PVP", pets)
		}

		newModal(id, title, acceptFunction, acceptText, cancelText, body, hiddenInputs = []) {
			let modal = document.createElement('dialog');
			modal.classList.add('dounfordModal');
			modal.id = id;
			modal.setAttribute('onclick','event.target==this && this.close()');
			let modalHTML = `<div class="dounfordModalHeader">
				<h5 class="modal-title text-secondary">${title}</h5>
				<button type="button" class="btn-close" onclick="this.parentNode.parentNode.close()"></button>`
			hiddenInputs.forEach((input) => {
				modalHTML += `<input type="hidden" id="${input}">`
			})
			modalHTML += `</div>
			<div class="dounfordModalBody">`
			if(body !== "") {
				modalHTML += body
			}
			modalHTML += "</div>"
			if(acceptText !== "disabled") {
				modalHTML += `<div class="dounfordModalFooter">
					<button onclick="this.parentNode.parentNode.close()">
						<span class="font-pixel hover">${cancelText}</span>
					</button>
					<button class="background-primary float-end" onclick="${acceptFunction}">
						<span class="font-pixel hover">${acceptText}</span>
					</button>
				</div>`}
			modal.innerHTML = modalHTML
			document.getElementById('content').insertAdjacentElement('beforeend', modal);
		}

		addUI() {
			//Friend Request Modal
			this.newModal(
				"friendRequest", "Friend Request", "IdlePixelPlus.plugins.pvp.acceptFR()", "Accept Friend Request", "Ignore", `<b><span id="friendRequestFriend">Player</span></b> wants to be your friend.`, ["friendRequestName"]
			)

			//Block List Modal
			this.newModal(
				"blockListModal", "Block List", "", "disabled", "",
				`<div class="blockedUser">
					<input type="text" id="pvpBlockUser" placeholder="Block User">
					<button class="background-primary rounded" onclick="IdlePixelPlus.plugins.pvp.blockPlayer()">Block</button>
				</div>
				<br>`, []
			)
			
			//PVP Tab
			const pvpPanel = `<div style="text-align:center;">
				<button onclick="document.getElementById('sendPVPModal').showModal()" class="background-primary">
					<span class="font-pixel font-large hover">Fight</span>
				</button>
				<button onclick="document.getElementById('blockListModal').showModal()">
					<span class="font-pixel font-large hover">Block List</span>
				</button>
			</div>
			<br>
			<div class="dounfordPVPGrid">
				<div id="dounfordPVPPets" style="background-color: darkturquoise;color: black;">
					<h3>PETS</h3>
					<div id="dounfordPVPPETS" style="display: grid;grid-template-columns: 1fr 1fr 1fr;gap: 10px;">
						<div id="dpvpbamboo" onclick="IdlePixelPlus.plugins.pvp.openPetModal('bamboo')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Start with less hp, but gets more when reviving">
							<img class="w50" src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/Bamboo.png">
							Bamboo
						</div>
						<div id="dpvpblackCat" onclick="IdlePixelPlus.plugins.pvp.openPetModal('blackCat')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Spells may fail or be more powerful">
							<img src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/BlackCat.png" style="height: 50px;">
							Black Cat
						</div>
						<div id="dpvpblackChicken" onclick="IdlePixelPlus.plugins.pvp.openPetModal('blackChicken')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Can be eaten or befriended for a new spell">
							<img class="w50" src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/BlackChicken.png">
							Black Chicken
						</div>
						<div id="dpvpblueChicken" onclick="IdlePixelPlus.plugins.pvp.openPetModal('blueChicken')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Shane would be pround of you, Egg Spell unlocked">
							<img class="w50" src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/BlueChicken.png">
							Blue Chicken
						</div>
						<div id="dpvpblueMushroom" onclick="IdlePixelPlus.plugins.pvp.openPetModal('blueMushroom')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Attacks may fail or hit higher">
							<img class="w50" src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/BlueMushroom.png">
							Blue Mushroom
						</div>
						<div id="dpvpcalicoCat" onclick="IdlePixelPlus.plugins.pvp.openPetModal('calicoCat')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Isn't it the cutest thing in the world?">
							<img src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/CalicoCat.png" style="height: 50px;">
							Calico Cat
						</div>
						<div id="dpvpfireSpirit" onclick="IdlePixelPlus.plugins.pvp.openPetModal('fireSpirit')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Empower all your attacks with fire">
							<img class="w50" src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/FireSpirit.png">
							Fire Spirit
						</div>
						<div id="dpvpgoldenChicken" onclick="IdlePixelPlus.plugins.pvp.openPetModal('goldenChicken')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Have you reached perfection? Anyways, Golden Egg Spell unlocked">
							<img class="w50" src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/GoldenChicken.png">
							Golden Chicken
						</div>
						<div id="dpvpgreenMushroom" onclick="IdlePixelPlus.plugins.pvp.openPetModal('greenMushroom')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Do I have to explain?">
							<img class="w50" src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/GreenMushroom.png">
							Green Mushroom
						</div>
						<div id="dpvphorse" onclick="IdlePixelPlus.plugins.pvp.openPetModal('horse')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Increase your speed">
							<img src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/horse.png" style="width:50px">
							Horse
						</div>
						<div id="dpvppurpleJay" onclick="IdlePixelPlus.plugins.pvp.openPetModal('purpleJay')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="You may dodge some attacks">
							<img class="w50" src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/PurpleJay.png">
							Purple Jay
						</div>
						<div id="dpvpspirit" onclick="IdlePixelPlus.plugins.pvp.openPetModal('spirit')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Spirit Blast Spell unlocked">
							<img class="w50" src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/Spirit.png">
							Spirit
						</div>
						<div id="dpvpwhiteBunny" onclick="IdlePixelPlus.plugins.pvp.openPetModal('whiteBunny')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Did you know that at first she would be the trainer in IP Pets script? Since it was scrapped your spells will be too">
							<img src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/WhiteBunny.png" style="height: 50px;">
							White Bunny
						</div>
						<div id="dpvpwhiteCat" onclick="IdlePixelPlus.plugins.pvp.openPetModal('whiteCat')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Increase almost all of your stats">
							<img src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/WhiteCat.png" style="height: 50px;">
							White Cat
						</div>
						<div id="dpvpwhiteChicken" onclick="IdlePixelPlus.plugins.pvp.openPetModal('whiteChicken')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Egg Spell Unlocked">
							<img class="w50" src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/WhiteChicken.png">
							White Chicken
						</div>
						<div id="dpvpwhyChicken" onclick="IdlePixelPlus.plugins.pvp.openPetModal('whyChicken')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="You may hit yourself">
							<img class="w50" src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/WhyChicken.png">
							Why Chicken
						</div>
					</div>
				</div>
				<div id="dounfordPVPLogs" style="background-color: aqua;grid-row: 1 / 3;grid-column: 2;padding: 10px;overflow-y: scroll;">
					<table style="font-size: 1.5rem;" class="market-history-table">
						<thead>
							<tr>
								<th>Opponent</th>
								<th>Outcome</th>
								<th>Date</th>
							</tr>
						</thead>
						<tbody id="dPVPLogsBody" style="text-transform: capitalize;"></tbody>
					</table>
				</div>
				<div style="background-color: teal;padding: 10px;">
					<h3>TITLES</h3>
					<div id="dounfordPVPTitles" style="display: grid;grid-template-columns: 1fr 1fr 1fr;gap: 10px;">
						<div id="dpvpDOUNFORD" onclick="IdlePixelPlus.plugins.pvp.changeTitle('DOUNFORD')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="What kind of person creates a title only for himself? Oh, that is right I did it">
							<img class="w50" src="https://cdn.idle-pixel.com/images/tree_sigil_chat.png">
							DOUNFORD
						</div>
						<div id="dpvpcontributor" onclick="IdlePixelPlus.plugins.pvp.changeTitle('contributor')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Thank you for helping the game, you deserve a title for it">
							<img class="w50" src="https://cdn.idle-pixel.com/images/donor_coins.png">
							Contributor
						</div>
						<div id="dpvpcompletionist" onclick="IdlePixelPlus.plugins.pvp.changeTitle('completionist')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="I hope you enjoyed the grind">
							<img class="w50" style="margin-top:-3px;" src="https://cdn.idle-pixel.com/images/trophy_icon.png">
							<span>Completionist</span>
						</div>
						<div id="dpvpwizard" onclick="IdlePixelPlus.plugins.pvp.changeTitle('wizard')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="Agro is that you?">
							<img class="w50" src="https://cdn.idle-pixel.com/images/magic.png">
							Wizard
						</div>
						<div id="dpvpA_VERY_SPECIAL_TITLE" onclick="IdlePixelPlus.plugins.pvp.changeTitle('A_VERY_SPECIAL_TITLE')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="This will be available in A VERY SPECIAL MOMENT">
							<img class="w50" src="https://cdn.idle-pixel.com/images/blood_diamond.png">
							A VERY SPECIAL TITLE
						</div>
						<div id="dpvpBOSS_SLAYER" onclick="IdlePixelPlus.plugins.pvp.changeTitle('BOSS_SLAYER')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="You defeated the boss">
							<img class="w50" src="https://cdn.idle-pixel.com/images/diamond.png">
							BOSS SLAYER
						</div>
						<div id="dpvpMONSTER" onclick="IdlePixelPlus.plugins.pvp.changeTitle('MONSTER')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="You really ate your pet? Why!?">
							<img class="w50" src="https://cdn.idle-pixel.com/images/faradox_gaurdians_notes.png">
							MONSTER
						</div>
						<div id="dpvpnovice" onclick="IdlePixelPlus.plugins.pvp.changeTitle('novice')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="You need to start somewhere">
							<img class="w50" src="https://cdn.idle-pixel.com/images/chicken_icon.png">
							Novice
						</div>
						<div id="dpvpapprentice" onclick="IdlePixelPlus.plugins.pvp.changeTitle('apprentice')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="You are getting better">
							<img class="w50" src="https://cdn.idle-pixel.com/images/skeleton_sword.png">
							Apprentice
						</div>
						<div id="dpvpexpert" onclick="IdlePixelPlus.plugins.pvp.changeTitle('expert')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="I'm sure you can defeat Smitty at this point">
							<img class="w50" src="https://cdn.idle-pixel.com/images/poison_stinger_dagger.png">
							Expert
						</div>
						<div id="dpvpchampion" onclick="IdlePixelPlus.plugins.pvp.changeTitle('champion')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="I can't believe someone spend so much time playing with my script, thank you">
							<img class="w50" src="https://cdn.idle-pixel.com/images/gold_rapier.png">
							Champion
						</div>
						<div id="dpvplegend" onclick="IdlePixelPlus.plugins.pvp.changeTitle('legend')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="You are one of the few who can be partner with the Lendary Golden Chicken">
							<img class="w50" src="https://res.cloudinary.com/dmhidlxwq/image/upload/v1724974600/pixel%20pvp/goldenChicken.png">
							Legend
						</div>
						<div id="dpvpimmortal" onclick="IdlePixelPlus.plugins.pvp.changeTitle('immortal')" style="display: none" class="dounfordPVPTitles dounfordHover" dounfordtooltip="You is the GOAT, nothing can stop you">
							<img class="w50" src="https://cdn.idle-pixel.com/images/dark_sword.png">
							Immortal
						</div>
					</div>
				</div>
			</div>`
			IdlePixelPlus.addPanel("dounfordPVP", "PVP", pvpPanel);

			const pvpMenuBtn = `
			<div onclick="switch_panels('panel-dounfordPVP')" class="hover hover-menu-bar-item left-menu-item">
                <table class="game-menu-bar-left-table-btn left-menu-item-other" style="width:100%">
                    <tbody><tr>
                        <td style="width:30px;">
                            <img class="w30" src="https://cdn.idle-pixel.com/images/dark_sword.png">
                        </td>
                        <td>
                            PVP
                        </td>
                    </tr>
                </tbody></table>
            </div>`
			document.getElementById('menu-bar-buttons').insertAdjacentHTML('beforeend', pvpMenuBtn);

			//Pet Modal
			this.newModal("dounfordPet","PET","IdlePixelPlus.plugins.pvp.equipPet()","Equip","Close",
				`<h4 id="pvpPetDisplayName">PET NAME</h4>
				<img id="pvpPetImage" src="" style="height:100px">
				<br>
				<br>
				<input type="text" id="pvpPetNewName" style="margin-right: 0.5rem;border-radius: 0.4rem;" placeholder="New Name">
				<button onclick="IdlePixelPlus.plugins.pvp.renamePet()">Rename</button>
				<br>
				<b>Level </b><span id="dounfordPetLevel">3</span>
				<br>
				<div id="dounfordPetXP">
					<b>XP: </b><span id="dounfordPetXPRequired">0/100</span>
				</div>
				</div>`,
			['pvpPetName'])


			//Send PVP Request Modal
			const sendPVPBody = `Enter Opponent's Username
			<br>
			<input type="text" id="sendFightName">
			<br>
			<br>
			<b>Fight Options</b>
			<div style="display: grid;grid-template-columns: auto auto auto;grid-gap: 5px;justify-items: start;">
				<div>
					<input type="checkbox" id="pvpCheck0" checked>
					<label for="pvpCheck0" dounfordTooltip="Enables Pets feature">PETS</label>
				</div>
				<div>
					<input type="checkbox" id="pvpCheck1">
					<label for="pvpCheck1" dounfordTooltip="Cold damage if you don't use bear/frozen crocodile armor">Cold Day</label>
				</div>
				<div>
					<input type="checkbox" id="pvpCheck2">
					<label for="pvpCheck2" dounfordTooltip="-1 hp each attack">Defender</label>
				</div>
				<div>
					<input type="radio" name="pvpWeakness" value="noWeakness" id="pvpNoWeakness" checked>
					<label for="pvpNoWeakness">No Weakness</label>
				</div>
				<div>
					<input type="radio" name="pvpWeakness" value="fireWeakness" id="pvpFireWeakness">
					<label for="pvpFireWeakness" dounfordTooltip="x2 fire damage">Fire Weakness</label>
				</div>
				<div>
					<input type="radio" name="pvpWeakness" value="iceWeakness" id="pvpIceWeakness">
					<label for="pvpIceWeakness" dounfordTooltip="x2 ice damage">Ice Weakness</label>
				</div>
				<div>
					<input type="radio" name="pvpArea" value="fields" id="pvpFields" checked>
					<label for="pvpFields">Fields</label>
				</div>
				<div>
					<input type="radio" name="pvpArea" value="mansion" id="pvpMansion">
					<label for="pvpMansion" dounfordTooltip="x2 Scythe damage">Haunted Mansion</label>
				</div>
				<div>
					<input type="radio" name="pvpArea" value="beach" id="pvpBeach">
					<label for="pvpBeach" dounfordTooltip="x2 Trident damage">Beach</label>
				</div>
				<div>
					<input type="radio" name="pvpRain" value="noRain" id="pvpNoRain" checked>
					<label for="pvpNoRain">No Rain</label>
				</div>
				<div>
					<input type="radio" name="pvpRain" value="rain" id="pvpRain">
					<label for="pvpRain" dounfordTooltip="Only Rain Amulet will cure">Rain</label>
				</div>
				<div>
					<input type="radio" name="pvpRain" value="mud" id="pvpMud">
					<label for="pvpMud" dounfordTooltip="Heavy damage if you don't use invisibility spell">Mud Rain</label>
				</div>
				<div>
					<input type="checkbox" id="pvpCheck3">
					<label for="pvpCheck3" dounfordTooltip="Arrows do nothing">No Ranged Weapons</label>
				</div>
				<div>
					<input type="checkbox" id="pvpCheck4">
					<label for="pvpCheck4" dounfordTooltip="Spells do nothing">No Spells</label>
				</div>
				<div>
					<input type="checkbox" id="pvpCheck5">
					<label for="pvpCheck5" dounfordTooltip="50% hit chance">Darkness</label>
				</div>
			</div>`
			this.newModal(
				"sendPVPModal", "Send PVP Request", "IdlePixelPlus.plugins.pvp.sendPVPRequest()", "Send PVP Request", "Cancel", sendPVPBody, []
			)
			
			//Receive PVP Request Modal
			const receivePVPBody = `<b><span id="receiveFightName">Opponent</span></b> wants to fight you.<br />
			<br />
			<div style="font-size: large; display: grid;">
				<span><b>Fight Options</b></span>
				<div id="receivePVPFlags" style="display: grid;grid-template-columns: auto auto;justify-content: space-around;">
					<span id="pvpFlag0" dounfordtooltip="Enables Pets feature">PETS</span>
					<span id="pvpFlag1" dounfordtooltip="Cold damage if you don't use bear/frozen crocodile armor">Cold Day</span>
					<span id="pvpFlag2" dounfordtooltip="-1 hp each attack">Defender</span>
					<span id="pvpFlag3" dounfordtooltip="Arrows do nothing">No Ranged Weapons</span>
					<span id="pvpFlag4" dounfordtooltip="Spells do nothing">No Spells</span>
					<span id="pvpFlag5" dounfordtooltip="50% hit chance">Darkness</span>
					<span id="pvpFlag6" dounfordtooltip="x2 fire damage">Fire Weakness</span>
					<span id="pvpFlag7" dounfordtooltip="x2 ice damage">Ice Weakness</span>
					<span id="pvpFlag8">Fields</span>
					<span id="pvpFlag9" dounfordtooltip="x2 Scythe damage">Haunted Mansion</span>
					<span id="pvpFlag10" dounfordtooltip="x2 Trident damage">Beach</span>
					<span id="pvpFlag11" dounfordtooltip="Only Rain Amulet will cure">Rain</span>
					<span id="pvpFlag12" dounfordtooltip="Heavy damage if you don't use invisibility spell">Mud Rain</span>
				</div>
			</div>`
			this.newModal(
				"receivePVPModal", "PVP Request", "IdlePixelPlus.plugins.pvp.acceptPVPRequest()", "Accept PVP Request", "Ignore", receivePVPBody, ["receiveFightEnemy"]
			)

			//Result Modal
			this.newModal(
				"dpvpResult", "PVP Result", "", "disabled", "", "<h4 id='dpvpResultText'>You draw against <b>Player</b>!</h4>",[]
			)

			//Combat Panel
			IdlePixelPlus.panels.dounfordPVPCombat = {id:'dounfordPVPCombat',title:'',content:''}
			const dpvpTab = `<div id="panel-dounfordPVPCombat" style="display: none;">
				<button onclick="switch_panels('panel-dounfordPVP')">BACK</button>
				<div style="margin: auto;width: fit-content;">
				<table>
				<tbody><tr>
					<td class="fight-right-border">
						
					</td>
					<td style="padding-top:20px;text-align: center;" class="canvas-fighting-td fight-top-border">
						<span class="hp-progress-bar">
							<span id="dpvp-hero-progress-bar-hp" class="hp-progress-bar-inner" style="width: 100%;"></span>
							<div class="progress-bar-label">
							<span id="dpvp_combat_hp">0/0</span>
							</div>
						</span>
						<br>
						<span class="mana-progress-bar">
							<span id="dpvp-hero-progress-bar-mana" class="mana-progress-bar-inner" style="width: 100%;"></span>
							<div class="progress-bar-label color-cyan">
							<span id="dpvp_combat_mana">0/0</span>
							</div>
						</span>
						
					</td>
					<td style="padding-top: 20px;" class="canvas-fighting-td fight-top-border">
						<center>
						<span class="hp-progress-bar">
							<span id="dpvp-enemy-progress-bar-hp" class="hp-progress-bar-inner" style="width: 100%;"></span>
							<div class="progress-bar-label">
							<span id="dpvp_combat_enemy_hp">0/0</span>
							</div>
						</span>
						<br><span class="mana-progress-bar">
							<span id="dpvp-enemy-progress-bar-mana" class="mana-progress-bar-inner" style="width: 100%;"></span>
							<div class="progress-bar-label color-cyan">
							<span id="dpvp_combat_enemy_mana">0/0</span>
							</div>
						</span>
						
						</center>
					</td>
					<td class="fight-left-border">
						
					</td>
				</tr>
				<tr>
					<td style="vertical-align:top;" class="fight-right-border">
						<div class="fighting-hero-stats-area hover shadow" style="border-right:none;text-align: center;display: flex;align-items: center;">
							<img id="dpvpHeroAvatar" class="w50" style="display: none;" src="">
							<div style="margin: auto;">
								<h3 id="dpvp-fighting-hero-label" style="text-transform: capitalize;">You</h3>
								<span id="dpvp-fighting-hero-title"></span>
							</div>
						</div>
			
						<div class="td-combat-bottom-panel shadow">
							<div class="td-combat-stat-entry">
							<img class="img-15" src="https://cdn.idle-pixel.com/images/accuracy_white.png"> 
							<span style="color:white">Accuracy:</span>
							<span id="dpvp_combat_hero_accuracy">0</span>
							</div>
							<div class="td-combat-stat-entry">
							<img class="img-15" src="https://cdn.idle-pixel.com/images/melee_damage_white.png"> 
							<span style="color:white">Damage:</span>
							<span id="dpvp_combat_hero_melee_damage">0</span>
							</div>
							<div class="td-combat-stat-entry">
							<img class="img-15" src="https://cdn.idle-pixel.com/images/arrow_damage_white.png"> 
							<span style="color:white">Damage:</span>
							<span id="dpvp_combat_hero_arrow_damage">0</span>
							</div>
							<div class="td-combat-stat-entry">
							<img class="img-15" src="https://cdn.idle-pixel.com/images/magic_damage_white.png"> 
							<span style="color:white">Magic:</span>
							<span id="dpvp_combat_hero_magic_bonus">0</span>
							</div>
							<div class="td-combat-stat-entry">
							<img class="img-15" src="https://cdn.idle-pixel.com/images/speed_white.png"> 
							<span style="color:white">Speed:</span>
							<span id="dpvp_combat_hero_speed">0</span>
							</div>
							<div class="td-combat-stat-entry">
							<img class="img-15" src="https://cdn.idle-pixel.com/images/defence_white.png"> 
							<span style="color:white">Defence:</span>
							<span id="dpvp_combat_hero_defence">0</span>
							</div>
							
						</div>
						<div id="dpvpSpells">
							<div id="dpvp-fighting-spell-heal" onclick="IdlePixelPlus.plugins.pvp.castSpell('heal')" class="fighting-spell-area-heal hover shadow">
								<img src="https://cdn.idle-pixel.com/images/upgraded_heal_spell_icon.png">
								<span id="dpvp-fighting-spell-label-heal" style="color: white;">Heal <span class="color-grey">(Q)</span></span>
							</div>
				
							<div id="dpvp-fighting-spell-fire" onclick="IdlePixelPlus.plugins.pvp.castSpell('fire')" class="fighting-spell-area-fire hover shadow">
								<img src="https://cdn.idle-pixel.com/images/fire_spell_icon.png">
								<span id="dpvp-fighting-spell-label-fire" style="color: white;">Fire <span class="color-grey">(W)</span></span>
							</div>
					
							<div id="dpvp-fighting-spell-reflect" onclick="IdlePixelPlus.plugins.pvp.castSpell('reflect')" class="fighting-spell-area-fire hover shadow">
								<img src="https://cdn.idle-pixel.com/images/reflect_spell_icon.png">
								<span id="dpvp-fighting-spell-label-reflect" style="color: white;">Reflect <span class="color-grey">(E)</span></span>
							</div>
				
							<div id="dpvp-fighting-spell-invisibility" onclick="IdlePixelPlus.plugins.pvp.castSpell('invisibility')" class="fighting-spell-area-invisibility hover shadow">
								<img src="https://cdn.idle-pixel.com/images/invisibility_spell_icon.png">
								<span id="dpvp-fighting-spell-label-invisibility" style="color: white;">Invisibility <span class="color-grey">(R)</span></span>
							</div>
						</div>
			
					
					</td>
					<td class="canvas-fighting-td fight-bottom-border">
						<div id="dpvp-fighting-countdown" style="display:none;" class="fighting-countdown">FIGHT IN 3</div>
						<canvas class="canvas-fighting" style="margin-left:100px;margin-right:100px;" id="dpvp-combat-canvas-hero" width="300px" height="600px">
						</canvas>
					</td>
					<td class="canvas-fighting-td fight-bottom-border">
						<canvas class="canvas-fighting" id="dpvp-combat-canvas-enemy" width="300px" height="600px" style="margin-left: 100px;margin-right:100px;">
						</canvas>
					</td>
					<td style="vertical-align:top;" class="fight-left-border">
						<div class="fighting-monster-stats-area hover shadow" style="text-align: center;display: flex;align-items: center;">
							<img id="dpvpEnemyAvatar" class="w50" style="display: none;" src="">
							<div style="margin: auto;">
								<h3 id="dpvp-fighting-enemy-label" style="text-transform: capitalize;">Enemy</h3>
								<span id="dpvp-fighting-enemy-title"></span>
							</div>
						</div>
			
						<div class="td-combat-bottom-panel shadow">
							<div class="td-combat-stat-entry">
							<img class="img-15" src="https://cdn.idle-pixel.com/images/accuracy_white.png"> 
							<span style="color:white">Accuracy:</span>
							<span id="dpvp_combat_enemy_accuracy">0</span>
							</div>
							<div class="td-combat-stat-entry">
							<img class="img-15" src="https://cdn.idle-pixel.com/images/melee_damage_white.png"> 
							<span style="color:white">Damage:</span>
							<span id="dpvp_combat_enemy_melee_damage">0</span>
							</div>
							<div class="td-combat-stat-entry">
							<img class="img-15" src="https://cdn.idle-pixel.com/images/arrow_damage_white.png"> 
							<span style="color:white">Damage:</span>
							<span id="dpvp_combat_enemy_arrow_damage">0</span>
							</div>
							<div class="td-combat-stat-entry">
							<img class="img-15" src="https://cdn.idle-pixel.com/images/magic_damage_white.png"> 
							<span style="color:white">Magic:</span>
							<span id="dpvp_combat_enemy_magic_bonus">0</span>
							</div>
							<div class="td-combat-stat-entry">
							<img class="img-15" src="https://cdn.idle-pixel.com/images/speed_white.png"> 
							<span style="color:white">Speed:</span>
							<span id="dpvp_combat_enemy_speed">0</span>
							</div>
							<div class="td-combat-stat-entry">
							<img class="img-15" src="https://cdn.idle-pixel.com/images/defence_white.png"> 
							<span style="color:white">Defence:</span>
							<span id="dpvp_combat_enemy_defence">0</span>
							</div>
							
						</div>
			
					</td>
				</tr>
				<tr>
					<td></td>
					<td style="text-align: center;">
						<div id="dpvp-combat-presets-area" style="" class="combat-presets-area shadow center">
								<img src="https://d1xsc8x7nc5q8t.cloudfront.net/images/combat_presets.png" class="w20" title="combat_presets"> <u class="color-silver">Presets</u><br><br>
								<img id="dpvp-in-combat-presets-icon-1" onclick="websocket.send('PRESET_LOAD=1~1')" class="combat-presets-combat-icon hover w30" src="" style="background-color: rgb(219, 255, 220);">
								<img id="dpvp-in-combat-presets-icon-2" onclick="websocket.send('PRESET_LOAD=2~1')" class="combat-presets-combat-icon hover w30" src="" style="background-color: rgb(117, 126, 255);">
								<img id="dpvp-in-combat-presets-icon-3" onclick="websocket.send('PRESET_LOAD=3~1')" class="combat-presets-combat-icon hover w30" src="" style="background-color: rgb(219, 255, 220);">
								<img id="dpvp-in-combat-presets-icon-4" onclick="websocket.send('PRESET_LOAD=4~1')" class="combat-presets-combat-icon hover w30" src="" style="background-color: rgb(255, 87, 87);">
								<img id="dpvp-in-combat-presets-icon-5" onclick="websocket.send('PRESET_LOAD=5~1')" class="combat-presets-combat-icon hover w30" src="" style="background-color: rgb(219, 255, 220);">
							</div>
						</td>
					<td></td>
					<td></td>
				</tr>
				</tbody></table>
			</div>
			</div>`;
			document.getElementById('panels').insertAdjacentHTML('beforeend', dpvpTab);
			const dpvpNot = `<div id="notification-dpvp-combat" style="display: none;" onclick="switch_panels('panel-dounfordPVPCombat');document.getElementById('menu-bar').style.display = 'none'" class="notification-banner-red hover">
				<img src="https://cdn.idle-pixel.com/images/fight.png" class="w20"> 
				<span style="color:red">IN PVP!</span>
				<span style="color:grey">(Click to resume)</span>
			</div>`
			document.getElementById('notification-raid').insertAdjacentHTML('afterend', dpvpNot);

			this.heroContext = document.getElementById("dpvp-combat-canvas-hero").getContext("2d");
			this.enemyContext = document.getElementById("dpvp-combat-canvas-enemy").getContext("2d");
			document.addEventListener('keydown', function(e) {
				const chatInput = document.getElementById('chat-area-input');
				const dpvpCombatPanel = document.getElementById('panel-dounfordPVPCombat');
				if (!chatInput.matches(':focus') && dpvpCombatPanel.style.display !== "none") {
					switch (e.key) {
						//Presets
						case "1": websocket.send('PRESET_LOAD=1~1'); break;
						case "2": websocket.send('PRESET_LOAD=2~1'); break;
						case "3": websocket.send('PRESET_LOAD=3~1'); break;
						case "4": websocket.send('PRESET_LOAD=4~1'); break;
						case "5": websocket.send('PRESET_LOAD=5~1'); break;
						//Spells
						case "q": IdlePixelPlus.plugins.pvp.castSpell('heal'); break;
						case "w": IdlePixelPlus.plugins.pvp.castSpell('fire'); break;
						case "e": IdlePixelPlus.plugins.pvp.castSpell('reflect'); break;
						case "r": IdlePixelPlus.plugins.pvp.castSpell('invisibility'); break;
					}
				}
			});
		}

		openPetModal(pet) {
			document.getElementById('pvpPetName').value = pet
			document.getElementById('pvpPetDisplayName').innerText = pets[pet].name
			document.getElementById('pvpPetImage').src = imagePath + pet
			document.getElementById('dounfordPetLevel').innerText = pets[pet].level
			const levelRequirement = pets[pet].level == 1 ? "/10" : pets[pet].level == 2 ? "/25" : ""
			document.getElementById('dounfordPetXPRequired').innerText = pets[pet].xp + levelRequirement
			document.getElementById('dounfordPet').showModal()
		}

		renamePet() {
			const pet = document.getElementById('pvpPetName').value
			const newName = document.getElementById('pvpPetNewName').value
			pets[pet].name = newName
			document.getElementById('pvpPetDisplayName').innerText = newName
			localStorage.setItem("dPVP-" + username + "pets", JSON.stringify(pets))
		}

		changePet() {
			const pet = document.getElementById('pvpPetName').value
			if (boughtPets.includes(pet)) {
				currentPet = pet;
			}
			localStorage.setItem("dPVP-currentPet", currentPet)
		}

		addFightHistory(fight) {
			let fightTr = document.createElement("tr");
			fightTr.innerHTML = `<td style="text-transform: capitalize;">${fight[0]}</td>
				<td>${fight[1]}</td>
				<td>${fight[2]}</td>`;
			document.getElementById("dPVPLogsBody").prepend(fightTr);
		}

		fightResult(result) {
			let resultText = document.getElementById("dPVPResultText");
			if (result == "Winner") {
				resultText.innerHTML = `You won against <b style="text-transform: capitalize">${IdlePixelPlus.plugins.pvp.currentEnemy}</b>, you did great!`
			} else {
				resultText.innerHTML = `You lost against <b style="text-transform: capitalize">${IdlePixelPlus.plugins.pvp.currentEnemy}</b>, better luck next time!`
			}
			document.getElementById("dPVPResult").showModal();
		}

		changeTitle(title) {
			if (titles.includes(title)) {
				currentTitle = title;
				Animations.scrollText("none", "white", "Title Changed");
				localStorage.setItem("dPVP-" + username + "currentTitle", currentTitle)
			}
		}

		changeaddFriendFunction() {
			Chat.add_friend_modal_submit = function() {
				var value = document.getElementById("modal-add-friend-input").value;
				websocket.send('ADD_FRIEND=' + value);
				IdlePixelPlus.plugins.pvp.sendFR(value)
			}
		}

		sendPVPRequest() {
			const enemy = document.getElementById('sendFightName').value;
			const fightOptions = {
				petAlly: document.getElementById('pvpCheck0').checked,
				coldDay: document.getElementById('pvpCheck1').checked,
				defender: document.getElementById('pvpCheck2').checked,
				fireWeakness: document.getElementById('pvpFireWeakness').checked,
				iceWeakness: document.getElementById('pvpIceWeakness').checked,
				area: document.querySelector('input[name=pvpArea]:checked').value,
				itRains: document.getElementById('pvpRain').checked,
				mudRain: document.getElementById('pvpMud').checked,
				noRanged: document.getElementById('pvpCheck3').checked,
				noSpells: document.getElementById('pvpCheck4').checked,
				darkness: document.getElementById('pvpCheck5').checked,
			};

			this.currentEnemy = enemy;
			
			this.options = fightOptions
			IdlePixelPlus.sendCustomMessage(enemy, {
                content: 'pvpR:' + JSON.stringify(fightOptions),
                timeout: 120000
            });
			document.getElementById('sendPVPModal').close();
		}

		receivePVPRequest(enemy,fightOptions) {
			const battleOptions = JSON.parse(fightOptions);
			this.options = battleOptions
			document.getElementById('receiveFightName').innerText = enemy;
			document.getElementById('receiveFightEnemy').value = enemy;

			document.getElementById('pvpFlag0').style.display = battleOptions.petAlly ? "" : "none",
			document.getElementById('pvpFlag1').style.display = battleOptions.coldDay ? "" : "none",
			document.getElementById('pvpFlag2').style.display = battleOptions.defender ? "" : "none",
			document.getElementById('pvpFlag3').style.display = battleOptions.noRanged ? "" : "none",
			document.getElementById('pvpFlag4').style.display = battleOptions.noSpells ? "" : "none",
			document.getElementById('pvpFlag5').style.display = battleOptions.darkness ? "" : "none",
			document.getElementById('pvpFlag6').style.display = battleOptions.fireWeakness ? "" : "none",
			document.getElementById('pvpFlag7').style.display = battleOptions.iceWeakness ? "" : "none",
			document.getElementById('pvpFlag8').style.display = battleOptions.area == "fields" ? "" : "none",
			document.getElementById('pvpFlag9').style.display = battleOptions.area == "mansion" ? "" : "none",
			document.getElementById('pvpFlag10').style.display = battleOptions.area == "beach" ? "" : "none",
			document.getElementById('pvpFlag11').style.display = battleOptions.itRains ? "" : "none",
			document.getElementById('pvpFlag12').style.display = battleOptions.mudRain ? "" : "none",

			document.getElementById('receivePVPModal').showModal();
		}

		acceptPVPRequest() {
			document.getElementById('receivePVPModal').close();
			this.currentEnemy = document.getElementById('receiveFightEnemy').value;
			IdlePixelPlus.sendCustomMessage(this.currentEnemy, {
                content: 'pvpAccept:' + username,
            });
			this.fighting = true;
			this.connectWebSocket(true);
		}

		connectWebSocket(player1){
			pvpWebSocket = new WebSocket('ws://localhost:3000');

			pvpWebSocket.addEventListener('open', () => {
				console.log('Connected to PVP server');
				pvpWebSocket.send('User=' + username + '~' + this.currentEnemy);
				if (player1) {
					pvpWebSocket.send('Config=' + JSON.stringify(this.options));
				}
				const pvpStats = {
					title: currentTitle,
					pet: currentPet,
					petLevel: pets[currentPet]?.level || 0,
					hp: parseInt(var_max_hp),
					maxHp: parseInt(var_max_hp),
					mana: parseInt(var_max_mana),
					maxMana: parseInt(var_max_mana),
					accuracy: parseInt(var_accuracy),
					damage: parseInt(var_melee_damage),
					arrowDamage: parseInt(var_arrow_damage),
					speed: parseInt(var_speed),
					defence: parseInt(var_defence),
					magicBonus: parseInt(var_magic_bonus),
					head: var_head,
					body: var_body,
					legs: var_legs,
					boots: var_boots,
					gloves: var_gloves,
					amulet: var_amulet,
					shield: var_shield,
					weapon: var_weapon,
					arrows: var_arrows,
				}
				pvpWebSocket.send('SetPlayer=' + JSON.stringify(pvpStats));
			});
			
			pvpWebSocket.addEventListener('message', (event) => {
				this.handleMessage(event.data);
			});
			
			pvpWebSocket.addEventListener('close', () => {
				console.log('PVP Fight ended');
				clearInterval(this.fight.tick);
				setTimeout(() => {
					delete this.fightHitplat[this.currentEnemy]
					this.currentEnemy = null;
				}, 2000)

				this.fight = {};
				this.fighting = false;
				document.getElementById("notification-dpvp-combat").style.display = "none";
			});
		}

		handleMessage(message) {
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
				case "UserToken":
					userToken = value;
					break;
				case "Fight":
					const parsedValue = JSON.parse(value);
					this.fight = parsedValue;
					this.fightHitplat[this.currentEnemy] = {};
					this.fightHitplat[username] = {};
					this.startPVP();
					console.log(this.fight)
					break
				case "Rain":
					document.getElementById("combat-rain").style.display = "";
					break;
				case "Mud":
					document.getElementById("combat-tar-rain").style.display = "";
					break;
				case "StopRain":
					document.getElementById("combat-rain").style.display = "none";
					document.getElementById("combat-tar-rain").style.display = "none";
					break;
				case "HitSplat":
					this.addHitSplat(value_array[0], value_array[1], value_array[2], value_array[3], value_array[4], value_array[5]);
					break;
				case "Reflect":
					this.fight[value].isReflecting = !this.fight[value].isReflecting;
					break;
				case "Invisibility":
					this.fight[value].isInvisible = !this.fight[value].isInvisible;
					break;
				case "SpellCooldown":
					this.spellCooldown(value_array[0],value_array[1],value_array[2]);
					break;
				case "Poison":
					this.fight[value].isPoisoned = true;
					break;
				case "UpdateStats":
					const stats = JSON.parse(value);
					for (let player in stats) {
						for (let key in stats[player]) {
							this.fight[player][key] = stats[player][key];
						}
					}
					this.updateStatsBars();
					break;
				case "RefreshEnemy":
					this.refreshEnemy(JSON.parse(value));
					break;
				case "FightResult":
					let result = [this.currentEnemy,value,get_utc_time()]
					fightHistory.push(result);
					localStorage.setItem("dPVP-" + username + "fightHistory", JSON.stringify(fightHistory));
					this.addFightHistory(result);
					this.fightResult(value);
					break;
				default:
					console.log(key, value);
					break;
			}
		}

		startPVP() {
			this.refreshPresetIcons();
			document.getElementById("dpvp-fighting-hero-label").innerText = username
			document.getElementById("dpvp-fighting-hero-title").innerText = currentTitle
			document.getElementById("dpvp-fighting-enemy-label").innerText = this.currentEnemy
			document.getElementById("dpvp-fighting-enemy-title").innerText = this.fight[this.currentEnemy].title
			document.getElementById("dpvpSpells").style.display = this.fight.config.noSpells ? "none" : "";
			document.getElementById("dpvp-fighting-spell-label-heal").innerHTML = 'Heal <span class="color-grey" style="color: rgb(128, 128, 128);">(Q)</span>';
			document.getElementById("dpvp-fighting-spell-label-fire").innerHTML = 'Fire <span class="color-grey" style="color: rgb(128, 128, 128);">(W)</span>';
			document.getElementById("dpvp-fighting-spell-label-reflect").innerHTML = 'Reflect <span class="color-grey" style="color: rgb(128, 128, 128);">(E)</span>';
			document.getElementById("dpvp-fighting-spell-label-invisibility").innerHTML = 'Invisibility <span class="color-grey" style="color: rgb(128, 128, 128);">(R)</span>';
			this.updateStatsBars();
			this.fight.tick = setInterval(function() {
				IdlePixelPlus.plugins.pvp.tick();
			}, 1000 / 60);
			switch_panels('panel-dounfordPVPCombat');
			document.getElementById("menu-bar").style.display = "none";
			document.getElementById("notification-dpvp-combat").style.display = "";
		}

		refreshPresetIcons()  {
			for(let i = 1; i < 6 ; i++)	{
				document.getElementById("dpvp-in-combat-presets-icon-" + i).src = get_image("images/" + Items.getItem("combat_preset_icon_" + i));
				document.getElementById("dpvp-in-combat-presets-icon-" + i).style.backgroundColor = Items.getItemString("combat_preset_color_" + i);
			}
		}

		refreshEnemy(foe) {
			this.fight[this.currentEnemy] = {...this.fight[this.currentEnemy], ...foe};
			this.updateStatsBars();
		}

		castSpell(spellName) {
			if (this.fight[username].cooldowns[spellName] == 0 && this.fight[username].mana >= manaCost[spellName]) {
				pvpWebSocket.send("Cast=" + spellName);
			}
		}

		spellCooldown(spellName, time, id) {
			if(this.fight[username]) {
				this.fight[username].cooldowns[spellName] = time;
				if (time > 0) {
					document.getElementById(id).innerText = time;
					setTimeout(function() {IdlePixelPlus.plugins.pvp.spellCooldown(spellName, time - 1, id)}, 1000);
				} else {
					if (this.fight[username].mana < manaCost[spellName]) {
						document.getElementById(id).innerText = 'NO MANA';
						return 
					}
					switch (spellName) {
						case "heal":
							document.getElementById(id).innerHTML = 'Heal <span class="color-grey" style="color: rgb(128, 128, 128);">(Q)</span>';
							break;
						case "fire":
							document.getElementById(id).innerHTML = 'Fire <span class="color-grey" style="color: rgb(128, 128, 128);">(W)</span>';
							break;
						case "reflect":
							document.getElementById(id).innerHTML = 'Reflect <span class="color-grey" style="color: rgb(128, 128, 128);">(E)</span>';
							break;
						case "invisibility":
							document.getElementById(id).innerHTML = 'Invisibility <span class="color-grey" style="color: rgb(128, 128, 128);">(R)</span>';
							break;
					}
				}
			}
		}

		updateStatsBars() {
			//Hero
			document.getElementById("dpvp_combat_hp").innerText= Math.max(0,this.fight[username].hp) + "/" + this.fight[username].maxHp; //Set the number on the hero hp bar
			let heroHpPercentage = Math.max(this.fight[username].hp / this.fight[username].maxHp,0) * 100;
			document.getElementById("dpvp-hero-progress-bar-hp").style.width = heroHpPercentage.toFixed() + "%"; // Set the hero hp bar background
			
			document.getElementById("dpvp_combat_mana").innerText = Math.max(0,this.fight[username].mana) + "/" + this.fight[username].maxMana; //Set the number on the hero mana bar
			let heroManaPercentage = Math.max(this.fight[username].mana / this.fight[username].maxMana,0) * 100;
			document.getElementById("dpvp-hero-progress-bar-mana").style.width = heroManaPercentage.toFixed() + "%"; // Set the mana hp bar background
			
			//Enemy
			document.getElementById("dpvp_combat_enemy_hp").innerText = Math.max(0,this.fight[this.currentEnemy].hp) + "/" + this.fight[this.currentEnemy].maxHp; //Set the number on the enemy hp bar
			let enemyHpPercentage = Math.max(this.fight[this.currentEnemy].hp / this.fight[this.currentEnemy].maxHp,0) * 100;
			document.getElementById("dpvp-enemy-progress-bar-hp").style.width = enemyHpPercentage.toFixed() + "%"; // Set the enemy hp bar background
			
			document.getElementById("dpvp_combat_enemy_mana").innerText = Math.max(0,this.fight[this.currentEnemy].mana) + "/" + this.fight[this.currentEnemy].maxMana; //Set the number on the hero mana bar
			let enemyManaPercentage = Math.max(this.fight[this.currentEnemy].mana / this.fight[this.currentEnemy].maxMana,0) * 100;
			document.getElementById("dpvp-enemy-progress-bar-mana").style.width = enemyManaPercentage.toFixed() + "%"; // Set the mana hp bar background
		}

		addHitSplat(label, icon, label_color, background_color, border_color, source) {
			let splat = new HitSplat(label, icon, label_color, background_color, border_color, 150, 450);
		
			let random_key = rand(1,500000);
			this.fightHitplat[source][random_key] = splat;
		
			setTimeout(
				function(){
					delete IdlePixelPlus.plugins.pvp.fightHitplat[source][random_key];
				}
			,1000)
		}

		//Evething that should be called each second
		tick() {
			//Hero Stats
			document.getElementById("dpvp_combat_hero_accuracy").innerText = var_accuracy;
			document.getElementById("dpvp_combat_hero_melee_damage").innerText = var_melee_damage;
			document.getElementById("dpvp_combat_hero_arrow_damage").innerText = var_arrow_damage;
			document.getElementById("dpvp_combat_hero_magic_bonus").innerText = var_magic_bonus;
			document.getElementById("dpvp_combat_hero_speed").innerText = var_speed;
			document.getElementById("dpvp_combat_hero_defence").innerText = var_defence;
			//Enemy Stats
			document.getElementById("dpvp_combat_enemy_accuracy").innerText = this.fight[this.currentEnemy].accuracy;
			document.getElementById("dpvp_combat_enemy_melee_damage").innerText = this.fight[this.currentEnemy].damage;
			document.getElementById("dpvp_combat_enemy_arrow_damage").innerText = this.fight[this.currentEnemy].arrowDamage;
			document.getElementById("dpvp_combat_enemy_magic_bonus").innerText = this.fight[this.currentEnemy].magicBonus;
			document.getElementById("dpvp_combat_enemy_speed").innerText = this.fight[this.currentEnemy].speed;
			document.getElementById("dpvp_combat_enemy_defence").innerText = this.fight[this.currentEnemy].defence;

			this.tickCanvas();
			this.manageHitplats();
		}

		tickCanvas() {
			this.heroContext.clearRect(0, 0, 300, 600);
			this.enemyContext.clearRect(0, 0, 300, 600);
			if (this.fight[username].isInvisible > 0) {
				this.heroContext.fillStyle = "white";
				this.heroContext.globalAlpha = 0.1;
				this.heroContext.fillRect(155, 20, 50, 50);
				this.heroContext.drawImage(Cache.getImage("images/ghost_icon.png","hero_invisible"), 155, 20);
			} else {
				this.heroContext.globalAlpha = 1.0;
			};
			if (this.fight[this.currentEnemy].isInvisible > 0) {
				this.enemyContext.fillStyle = "white";
				this.enemyContext.globalAlpha = 0.1;
				this.enemyContext.fillRect(155, 20, 50, 50);
				this.enemyContext.drawImage(Cache.getImage("images/ghost_icon.png","hero_invisible"), 155, 20);
			} else {
				this.enemyContext.globalAlpha = 1.0;
			};
			if (this.fight[username].isReflecting == true) {
				this.heroContext.fillStyle = "white";
				this.heroContext.fillRect(95, 20, 50, 50);
				this.heroContext.drawImage(Cache.getImage("images/reflect_spell.png","hero_reflecting"), 95, 20);
			};
			if (this.fight[this.currentEnemy].isReflecting == true) {
				this.enemyContext.fillStyle = "white";
				this.enemyContext.fillRect(95, 20, 50, 50);
				this.enemyContext.drawImage(Cache.getImage("images/reflect_spell.png","hero_reflecting"), 95, 20);
			};

			this.heroContext.drawImage(Cache.getImage("images/hero_head_" + Items.getItemString('head') + ".png","hero_dpvp_head"), 0, 300);
			this.heroContext.drawImage(Cache.getImage("images/hero_body_" + Items.getItemString('body') + ".png","hero_dpvp_body"), 0, 300);
			this.heroContext.drawImage(Cache.getImage("images/hero_gloves_" + Items.getItemString('gloves') + ".png","hero_dpvp_gloves"), 0, 300);
			this.heroContext.drawImage(Cache.getImage("images/hero_legs_" + Items.getItemString('legs') + ".png","hero_dpvp_legs"), 0, 300);
			this.heroContext.drawImage(Cache.getImage("images/hero_boots_" + Items.getItemString('boots') + ".png","hero_dpvp_boots"), 0, 300);
			this.heroContext.drawImage(Cache.getImage("images/hero_amulet_" + Items.getItemString('amulet') + ".png","hero_dpvp_amulet"), 0, 300);
			this.heroContext.drawImage(Cache.getImage("images/hero_shield_" + Items.getItemString('shield') + ".png","hero_dpvp_shield"), 0, 300);
			this.heroContext.drawImage(Cache.getImage("images/hero_weapon_" + Items.getItemString('weapon') + ".png","hero_dpvp_weapon"), 0, 300);

			this.enemyContext.save();
    		this.enemyContext.translate(300, 0);
    		this.enemyContext.scale(-1,1);
			this.enemyContext.drawImage(Cache.getImage("images/hero_head_" + this.fight[this.currentEnemy].head + ".png","enemy_dpvp_head"), 0, 300);
			this.enemyContext.drawImage(Cache.getImage("images/hero_body_" + this.fight[this.currentEnemy].body + ".png","enemy_dpvp_body"), 0, 300);
			this.enemyContext.drawImage(Cache.getImage("images/hero_gloves_" + this.fight[this.currentEnemy].gloves + ".png","enemy_dpvp_gloves"), 0, 300);
			this.enemyContext.drawImage(Cache.getImage("images/hero_legs_" + this.fight[this.currentEnemy].legs + ".png","enemy_dpvp_legs"), 0, 300);
			this.enemyContext.drawImage(Cache.getImage("images/hero_boots_" + this.fight[this.currentEnemy].boots + ".png","enemy_dpvp_boots"), 0, 300);
			this.enemyContext.drawImage(Cache.getImage("images/hero_amulet_" + this.fight[this.currentEnemy].amulet + ".png","enemy_dpvp_amulet"), 0, 300);
			this.enemyContext.drawImage(Cache.getImage("images/hero_shield_" + this.fight[this.currentEnemy].shield + ".png","enemy_dpvp_shield"), -60, 300);
			this.enemyContext.drawImage(Cache.getImage("images/hero_weapon_" + this.fight[this.currentEnemy].weapon + ".png","enemy_dpvp_weapon"), 45, 300);
			this.enemyContext.restore()
		}

		manageHitplats() {
			for (let key in this.fightHitplat[username]) {
				this.fightHitplat[username][key].draw(this.heroContext);
			};
			for (let key in this.fightHitplat[this.currentEnemy]) {
				this.fightHitplat[this.currentEnemy][key].draw(this.enemyContext);
			};
		}

		sendFR(username) {
            IdlePixelPlus.sendCustomMessage(username, {
                content: `friendRequest`,
            });
        }

		receiveFR(username) {
            document.getElementById('friendRequestName').value = username
            document.getElementById('friendRequestFriend').innerText = username
            document.getElementById('friendRequest').showModal();
        }

		acceptFR() {
            document.getElementById('friendRequest').close();
            const friend = document.getElementById('friendRequestName').value
			websocket.send('ADD_FRIEND=' + friend);
		}

		blockPlayer(player,unblock) {
			if (player == null) {
				player = document.getElementById('pvpBlockUser').value
			}
			if (unblock == true) {
				this.blockedUsers = this.blockedUsers.filter(function(user) {
					return user !== player
				})
				document.getElementById('pvpBlocked-' + player).remove()
			} else {
				if (!this.blockedUsers.includes(player)) {
					this.blockedUsers.push(player)
				}
				let blockedDiv = document.createElement('div')
				blockedDiv.id = 'pvpBlocked-' + player
				blockedDiv.classList.add('blockedUser')
				
				let unblockBtn = document.createElement('button')
				unblockBtn.classList.add('background-primary', 'rounded')
				unblockBtn.innerText = 'Unblock'
				unblockBtn.addEventListener('click', () => {
					this.blockPlayer(player, true)
				})

				blockedDiv.append(player, unblockBtn)
				document.querySelector('#blockListModal .dounfordModalBody').append(blockedDiv)
			}
			let users = JSON.stringify(this.blockedUsers)
			localStorage.setItem('PVP-BlockedUsers', users);
		}
	}
 
	const plugin = new pvpPlugin();
	IdlePixelPlus.registerPlugin(plugin);
 
})();