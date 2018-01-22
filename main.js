const Discord = require('discord.js');

const client = new Discord.Client();
const { prefix, token } = require('./config.json');

client.on('ready', () => console.log('Music portion online'));

client.on('message', message => {
    if()
});

