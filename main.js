// const { fetch } = require('undici');
// const express = require('express');
// const fetch = require('node-fetch');
// const btoa = require('btoa');
// const { clientId, clientSecret, port } = require('./config.json');
import express from 'express';
import fetch from 'node-fetch'
import { MongoClient, ServerApiVersion } from 'mongodb'

//Bot section (PLACE IN ENV)
import { Client, Intents } from 'discord.js';
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

bot.on('ready', async () => {console.log('BOT RUNNING'); });
bot.login(token);


async function getJSONResponse(body) {
	let fullBody = '';

	for await (const data of body) {
		fullBody += data.toString();
	}
	return JSON.parse(fullBody);
}

const app = express();
// app.use(express.json());
app.use(express.static('/assets'));

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

	return response.send(guilds);
	return response.sendFile('myGuilds.html', { root: '.' });
})


app.get('/myGuilds.html', async (req, res) => {
	return res.sendFile('myGuilds.html', { root: '.' });
});


app.post('/getServer', async (req, res) => {
	const id = req.headers.servernumber;
	
	//Get info
	connection.then((client) => {
		const dbo = client.db(id).collection('SETUP');
		dbo.find().toArray(async (err, docs) => {
			if (err) { return console.error(err); }
	
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
	})

	res.send(arr);
});


app.get('/dashboard.html', async (req, res) => {
	return res.sendFile('dashboard.html', { root: '.' });
});


app.get('/premium.html', async (req, res) => {
	return res.sendFile('premium.html', { root: '.' });
});

app.get('/index.html', async (req, res) => {
	return res.sendFile('index.html', { root: '.' });
});


//Stripe stuff
app.get('/.well-known/apple-developer-merchantid-domain-association', async (req, res) => {
	return res.sendFile('apple-developer-merchantid-domain-association', { root: '.' });
});


app.post('/sendData', async (req, res) => {
	try {
		const pref = JSON.parse(req.headers.serversettings);

		connection.then(async (client) => {
			const dbo = client.db(pref.Id).collection('SETUP');

			await dbo.updateOne({ _id: 'WELCOME' }, {$set: { welcomechannel: pref.WELCOME.welcomechannel, welcomemessage: pref.WELCOME.welcomemessage }});
			await dbo.updateOne({ _id: 'LOG' }, {$set: { keepLogs: pref.LOG.keepLogs, logchannel: pref.LOG.logchannel, severity: pref.LOG.severity }});
		}).then(() => { res.send("DONE"); })

	} catch (err) {
		console.error(err);
		res.send("FAILED");
	}
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
					redirect_uri: `https://selmer-bot-website.herokuapp.com`,
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

	return response.sendFile('index.html', { root: '.' });
});

app.listen(port, () => console.log(`App listening on port ${port}`));