// const { fetch } = require('undici');
// const express = require('express');
// const fetch = require('node-fetch');
// const btoa = require('btoa');
// const { clientId, clientSecret, port } = require('./config.json');
import express from 'express'
import fetch from 'node-fetch'
import { MongoClient, ServerApiVersion } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { validate as uuidValidate } from 'uuid';
import bodyParser from 'body-parser'
// import formidable from 'formidable'; //Heroku doesn't recognize this

//Bot section (PLACE IN ENV)
import { Client, Intents, MessageEmbed } from 'discord.js';
const token = process.env.token;
const clientId = process.env.clientId;
const clientSecret = process.env.clientSecret;
const port = process.env.PORT || 3000;
const mongouri = process.env.mongouri;
const client = new MongoClient(mongouri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
const connection = client.connect();


const bot = new Client({ 
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
        Intents.FLAGS.GUILD_VOICE_STATES,
        Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
        Intents.FLAGS.GUILD_PRESENCES,
        Intents.FLAGS.GUILD_MEMBERS,
        Intents.FLAGS.DIRECT_MESSAGES,
        Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
        Intents.FLAGS.DIRECT_MESSAGE_TYPING,
    ],
    partials: [ 'CHANNEL' ]
});

bot.home_server = process.env.home_server;
bot.on('ready', async () => {console.log('BOT RUNNING'); });
bot.login(token);


async function getJSONResponse(body) {
	let fullBody = '';

	for await (const data of body) {
		fullBody += data.toString();
	}
	return JSON.parse(fullBody);
}


async function setCurrentServer(sid, id) {
	return new Promise((resolve, reject) => {
		try {
			if (id) {
				const obj = {};
				const arr = {text: [], voice: []};
				const guild = bot.guilds.cache.get(id);

				const roles = [];
				guild.roles.cache.filter((role) => { return(!role.managed) }).forEach((role) => {
					let newObj = {};
					newObj.Id = role.id;
					newObj.name = role.name;
					newObj.color = role.hexColor;
					
					roles.push(newObj);
				});

				const channels = guild.channels.cache;
				channels.forEach((channel) => {
					const type = channel.type;
					if (type == 'GUILD_TEXT') {
						arr.text.push({ name: channel.name, id: channel.id });
					} else if (type == 'GUILD_VOICE') {
						arr.voice.push({ name: channel.name, id: channel.id });
					}
				});

				connection.then((client) => {
					const dbo = client.db(id).collection('SETUP');
					dbo.find().toArray(async (err, docs) => {
						const m = new Map();
						m.set('Id', id);

						await Promise.all(docs.map(async (doc) => {
							m.set(doc._id, doc);
						})).then(() => {
							obj['Id'] = id;
							obj['roles'] = JSON.stringify(roles);
							obj['channels'] = JSON.stringify(arr);
							obj['serverSettings'] = JSON.stringify(Object.fromEntries(m));
							
							const dbo = client.db('main').collection('sessions');
							dbo.updateOne({ sessionId: sid }, {$set: { currentServer: JSON.stringify(obj) }});
							resolve(200);
						});
					})
				});
			}
		} catch (err) {
			reject(err);
		}
	});
}



const app = express();
// app.use(express.json());
app.use(express.static('/assets'));
app.use('/CSS', express.static('./CSS'));
app.use('/scripts', express.static('./scripts'));
app.use(bodyParser.urlencoded({ extended: true }));


app.post('/user', async(request, response) => {
	const guilds = JSON.parse(request.headers.guilds);

	const id = request.headers.userid;

	for (let i = 0; i < guilds.length; i ++) {
		const guild = bot.guilds.cache.get(guilds[i].id);
		
		if (guild && guild.ownerId == id) {
			guilds[i].inServer = true;
		} else {
			guilds[i].inServer = false;
		}
	}

	//Add the guilds to the session data
	connection.then((client) => {
		const sessionId = uuidv4();

		//Used for database clearing
		const d = new Date();
		d.setHours(0);
		d.setMinutes(0);
		d.setSeconds(0);

		const dbo = client.db('main').collection('sessions');
		dbo.insertOne({ sessionId: sessionId, userId: id, guilds: JSON.stringify(guilds), currentServer: null, timeStamp: d.getTime() });

		response.send(sessionId);
	});
});


app.post('/logout', async (req, res) => {
	connection.then((client) => {
		const sessionId = req.headers.sessionid;
		const dbo = client.db('main').collection('sessions');
		dbo.deleteOne({ sessionId: sessionId });
	});

	res.sendStatus(200);
});


app.post('/getSessionInfo', async (req, res) => {
	const session = req.headers.session;
	if (session) {
		if (uuidValidate(session)) {
			connection.then((client) => {
				const dbo = client.db('main').collection('sessions');
				dbo.findOne({ sessionId: session }).then((doc) => {
					res.send(doc);
				})
			})
		}
	}
});


app.post('/getServer', async (req, res) => {
	const id = req.headers.servernumber;
	
	//Get info
	connection.then((client) => {
		const dbo = client.db(id).collection('SETUP');
		dbo.find().toArray(async (err, docs) => {
	
			const m = new Map();
			m.set('Id', id);
			await Promise.all(docs.map(async (doc) => {
				m.set(doc._id, doc);
	
			})).then(() => { res.send(JSON.stringify(Object.fromEntries(m))); })
		})
	});
	
	// return res.sendFile('myGuilds.html', { root: '.' });
})


app.get('/getChannels', async (req, res) => {
	const id = req.headers.servernumber;
	const channels = bot.guilds.cache.get(id).channels.cache;
	
	const arr = {text: [], voice: []};

	channels.forEach((channel) => {
		const type = channel.type;
		if (type == 'GUILD_TEXT') {
			arr.text.push({ name: channel.name, id: channel.id });
		} else if (type == 'GUILD_VOICE') {
			arr.voice.push({ name: channel.name, id: channel.id });
		}
	});

	res.send(arr);
});


//Headers: servernumber, sessionid
app.post('/setCurrentServer', async (req, res) => {
	const {servernumber, sessionid} = req.headers;
	setCurrentServer(sessionid, servernumber).then((code) => {
		res.sendStatus(code);
	}).catch((err) => {
		console.error(err);
		res.sendStatus(500);
	});
});


app.get('/getCal', async (req, res) => {
	const userId = req.headers.userid || false;
	const guildId = req.headers.guildid || false;

	connection.then((client) => {
		var times;

		const dbo = client.db('main').collection('reminderKeys');
		dbo.findOne({$or: [ {userId: userId}, {userId: guildId} ]}).then((doc) => {
			if (!doc) { return res.send([[], []]); }
			times = doc.times;
			let tbo = client.db('main').collection('reminders');

			// { $where: function() { return (times.indexOf(this.time) != -1 && this.userId == userId); }}
			// tbo.find({time: {$in: times}}).toArray((err, docs) => { console.log("A", docs); throw 1; });
			
			tbo.find({time: {$in: times}}).toArray((err, docs) => {

				//There's gotta be a better way
				let newdoc = [];
				for (let i = 0; i < docs.length; i ++) {
					newdoc.push({});
					for (let j in docs[i]) {
						if (!isNaN(j) && (docs[i][j].userId == userId || docs[i][j].guildId == guildId)) {
							// console.log(`${docs[i][j].userId} == ${userId}`, `${docs[i][j].guildId} == ${guildId}`);
							newdoc[i][j] = docs[i][j];
						}
					}

					newdoc[i]._id = docs[i]._id;
					newdoc[i].time = docs[i].time;
					newdoc[i].amt = docs[i].amt;

					//If there's nothing on that date, skip
					// if (newdoc[i].amt == 0) { console.log(newdoc[i]); }
				}
				res.send(JSON.stringify([times, newdoc]));
			});
		});
	})
});


//#region HTML gile serving

app.get('/myGuilds', async (req, res) => {
	return res.sendFile('myGuilds.html', { root: 'HTML' });
});


app.get('/dashboard', async (req, res) => {
	return res.sendFile('dashboard.html', { root: 'HTML' });
});


app.get('/premium', async (req, res) => {
	return res.sendFile('premium.html', { root: 'HTML' });
});

app.get('/index', async (req, res) => {
	return res.sendFile('index.html', { root: 'HTML' });
});

app.get('/calEvent', async (req, res) => {
	return res.sendFile('calEvent.html', { root: 'HTML' });
});

app.get('/newCalEvent', async (req, res) => {
	return res.sendFile('newCalEvent.html', { root: 'HTML' });
});

app.get('/calendar', async (req, res) => {
	return res.sendFile('calendar.html', { root: 'HTML' });
});

app.get('/team', async (req, res) => {
	return res.sendFile("team.html", { root: 'HTML' });
});

app.get('/joinedGuild', async (req, res) => {
	res.sendFile('joinedGuild.html', { root: 'HTML' });
});

app.post('/joinedGuild', async (req, res) => {
	// res.sendFile('joinedGuild.html', { root: 'HTML' });
	const { headers } = req;
	const { servernumber, sessionid } = headers;

	connection.then((client) => {
		const dbo = client.db('main').collection('sessions');
		dbo.find().toArray((err, docs) => {
			const guilds = JSON.parse(docs[0].guilds);

			try {
				for (let i = 0; i < guilds.length; i++) {
					if (guilds[i].id == servernumber) {
						guilds[i].inServer = true;
						setCurrentServer(sessionid, servernumber);
						return res.sendStatus(200);
					}
				}
			} catch (err) {
				console.log(err);
				res.sendStatus(500);
			}
		});
	});
});

//#endregion


//#region INCLUDES

app.get('/cal.css', async (req, res) => {
	return res.sendFile('cal.css', { root: 'CSS' });
})

//#endregion

app.post("/suggestion", async (req, res)=> {
	if (req.headers.sessionid == 'null') {
		return res.sendStatus(401);
	}
	
	const suggestion = req.headers.suggestion;
	if (suggestion) {
		connection.then((client) => {
			const dbo = client.db("main").collection("sessions");
			dbo.findOne({ "sessionId": req.headers.sessionid }).then((doc) => {

				if (!doc) {
					return res.sendStatus(410);
				}

				const discId = doc.userId;
				const user = bot.users.cache.get(discId);

				const channel = bot.guilds.cache.get(bot.home_server).channels.cache.get('944330760146534492');
				const embd = new MessageEmbed()
				
				//If the bot doesn't have the user, just put the id in
				var uid, icon;
				if(!user) {
					uid = `<@${discId}>`;
					icon = 'https://github.com/ION606/selmer-bot-website/blob/main/assets/circleOutline.png?raw=true';
				} else {
					uid = `${user.username}#${user.discriminator}`;
					icon = user.displayAvatarURL();
				}

				embd.setAuthor({ name: `${uid}`, url: "", iconURL: icon });
				embd.setTitle(`Selmer Bot Suggestion`);

				embd.setColor("ORANGE")
				.setTimestamp()
				.setDescription(suggestion)
				.setThumbnail('https://github.com/ION606/selmer-bot-website/blob/main/assets/suggestion.png?raw=true')
				.setFooter({ text: 'This suggestion came from the Selmer Bot Website suggestion box'});

				channel.send({ embeds: [embd] })

				res.sendStatus(200);
			});
		});
	}
})

//Stripe stuff
app.get('/.well-known/apple-developer-merchantid-domain-association', async (req, res) => {
	return res.sendFile('apple-developer-merchantid-domain-association', { root: '.' });
});

app.post('/verifypremium', async (req, res) => {
	if (req.headers.userid) {
		const id = req.headers.userid;

		connection.then((client) => {
			const dbo = client.db('main').collection('authorized');
			dbo.findOne({ discordID: id }).then((doc) => {
				if (doc != undefined) {
					res.sendStatus(200);
				} else {
					res.sendStatus(401);
				}
			}).catch((err) => {
				console.error(err); return res.sendStatus(500);
			})
		});
	}
});

app.post('/sendData', async (req, res) => {
	try {
		if (req.headers.reminders) {
			connection.then((client) => {

				const delObjKeys = JSON.parse(req.headers.delobjkeys);
				// const userId = req.headers.userid;
				const dbo = client.db('main').collection('reminders');
				const kbo = client.db('main').collection('reminderKeys');

				//Update the Time object
				for (var i in delObjKeys) {
					var obj = delObjKeys[i];

					dbo.findOne({ time: obj.time }).then((doc) => {
						if (doc) {
							// kbo.findOne({ 'userId': doc[obj.eventInd].userId }).then((doc) => {
							// 	console.log(doc);
							// }); return console.log(obj.time);
							doc.amt --;

							// console.log(doc[obj.eventInd]); return;
							var searchId;
							if (doc[obj.eventInd].userId != null) {
								searchId = doc[obj.eventInd].userId;
							} else if (doc[obj.eventInd].guildId != null) {
								searchId = doc[obj.eventInd].guildId;
							}

							kbo.findOne({ 'userId': searchId }).then((kdoc) => {
								if ((kdoc.times.length - 1) > 0) {
									kbo.updateOne({ 'userId': searchId }, {$pull: { times: obj.time }});
								} else {
									kbo.deleteOne({ 'userId': searchId });
								}
							});

							//If there's nothing left in the list, delete it
							if (doc.amt > 0) {
								delete doc[obj.eventInd];
								// dbo.findOneAndUpdate({ time: obj.time }, newdoc);
								dbo.findOneAndReplace({ time: obj.time }, doc);
							} else {
								dbo.deleteOne({ time: obj.time });
							}
						} // else { console.log("NONE", obj.time ); }

					}).catch((err) =>  {
						console.log("ERR");
						console.error(err)
						res.sendStatus(500);
					});

					// kbo.findOneAndUpdate({ userId: userId }, { $pull: {}})
				}
			}).then(() => {
				res.sendStatus(200);
			});
		} else {
			const pref = JSON.parse(req.headers.serversettings);

			connection.then(async (client) => {
				const dbo = client.db(pref.Id).collection('SETUP');

				await dbo.updateOne({ _id: 'WELCOME' }, {$set: { welcomechannel: pref.WELCOME.welcomechannel, welcomemessage: pref.WELCOME.welcomemessage }});
				await dbo.updateOne({ _id: 'LOG' }, {$set: { keepLogs: pref.LOG.keepLogs, logchannel: pref.LOG.logchannel, severity: pref.LOG.severity }});
				await dbo.updateOne({ _id: 'announcement' }, {$set: { channel: pref.announcement.channel, role: pref.announcement.role }});
			}).then(() => { res.send("DONE"); })
			.catch((err) => {
				console.error(err);
				res.send("FAILED");
			});
		}
	} catch (err) {
		console.error(err);
		res.send("FAILED");
	}
});


//Reminder format = { time: 1212122, event: { guildId: "930148608400035860", userId: "12", name: "Some Generic Name", description: "Some description", offset: "15", link: "https://www.example.com" } }
app.post('/newCalEvent', async (req, res) => {
	if (req.headers.newcalevent) {
		try {
			const obj = JSON.parse(req.headers.newcalevent);
			// console.log(obj.time, typeof obj.time); return;
			var searchId;
			if (obj.event.userId != null) {
				searchId = obj.event.userId;
			} else if (obj.event.guildId != null) {
				searchId = obj.event.guildId;
			} else { return res.sendStatus(400); }

			connection.then((client) => {
				// Update the Key object first to check if the time is already there
				const kbo = client.db('main').collection('reminderKeys');
				kbo.findOne({ 'userId': searchId }).then((doc) => {

					if (doc) {
						if (doc.times.indexOf(obj.time) == -1) {
							kbo.updateOne({ 'userId': searchId }, { $push: { times: obj.time } })
							.catch((err) => { console.error(err); res.sendStatus(500); });
						} else {
							return res.sendStatus(409);
						}
					} else {
						doc = { 'userId': searchId, times: [obj.time] }
						kbo.insertOne(doc);
					}


					//Update the Time object
					const dbo = client.db('main').collection('reminders');
					dbo.findOne({ time: obj.time }).then((doc) => {
						let n = 0;
						if (doc) {
							n = doc.amt;
							doc.amt ++;

							doc[`${n}`] = obj.event;
							dbo.findOneAndReplace({ time: obj.time }, doc);
						} else {
							const d = new Date(Number(obj.time));
							doc = { "0": obj.event, "time": obj.time, "month": d.getMonth(), "amt": 1 }; //Month used for clearing when the calendar month begins (maybe modify the garbage collection with an `else if (day == 1? clear last month)` )
							dbo.insertOne(doc);
						}

						res.sendStatus(200);
					}).catch((err) =>  {
						console.log("ERR");
						console.error(err);
						res.sendStatus(500);
					});
				}).catch((err) =>  {
					console.log("ERR");
					console.error(err);
					res.sendStatus(500);
				});

				// //Make sure there hasn't been an error (header not yet sent);
				// if (res.headersSent) { return console.log("ERROR"); }
			});
		} catch (err) {
			console.error(err);
			return res.sendStatus(500);
		}
	}
});


/*
app.post("/newics", async(req, res) => {
	var fileupload = req.body.filetoupload;
    var form =  new formidable.IncomingForm();
    form.parse(req, function(err, fields, files){
    	 var oldpath = files.fileupload.path;
         var newpath = "C:/Users/itama_za9au7b/Downloads/SBFiles/"+files.fileupload.name;
         fs.rename(oldpath, newpath, function(err){
         	if(err) {
         		console.log(err);
				res.sendStatus(500);
			} else{
                res.write("File Uploaded");
                res.sendStatus(200);
            }
         }); 
    });
});
*/


app.get("/userData", async (req, res) => {
	connection.then((client) => {
		const headers = req.headers;
		const dbo = client.db();
	});
});


app.get("/releases", async (req, res) => {
	res.sendFile('releases.html', { root: 'HTML' });
});


app.get("/downloads/*", async (req, res) => {
	return res.sendFile(`${req.path}`, {root: '.'});
});


app.get('/', async ({ query }, response) => {
	const { code } = query;

	if (code) {
		try {
			await fetch('https://discord.com/api/oauth2/token', {
				method: 'POST',
				body: new URLSearchParams({
					client_id: clientId,
					client_secret: clientSecret,
					code,
					grant_type: 'authorization_code',
					redirect_uri: `https://selmerbot.com/`,
					scope: 'identify',
				}),
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
			}).then(async response => {
				const oauthData = await getJSONResponse(response.body);
				// console.log(oauthData);
			}).catch(err => { console.error(err); });
		} catch (error) {
			// NOTE: An unauthorized token will not throw an error
			// tokenResponseData.statusCode will be 401
			console.error(error);
		}
	}

	return response.sendFile('index.html', { root: 'HTML' });
});


app.get("*",(req,res) => {
    res.sendFile("404.html", {root: 'HTML'});
})

app.listen(port, () => console.log(`App listening on port ${port}`));