const { Client, Util } = require('discord.js');
const { TOKEN, PREFIX, GOOGLE_API_KEY } = require('./config.json');
const YouTube = require('simple-youtube-api');
const ytdl = require('ytdl-core');

const client = new Client({ disableEveryone: true });

const youtube = new YouTube(GOOGLE_API_KEY);

const queue = new Map();

client.on('message', async message => {
    if (message.author.bot) return undefined;

    var name = message.member.nickname || message.author.username
    
    if(message.channel.id === "382585019300053015" && message.content.startsWith('')){
        client.channels.get('408801065949986827').send(`${name} >> ${message.content}`);
    }

    if(message.channel.id === "408801065949986827" && message.content.startsWith('')){
        message.delete();
        client.channels.get('382585019300053015').send(`${message.content}`);
    }
});

client.on('warn', console.warn);

client.on('error', console.error);

client.on('ready', () => console.log('Music portion ready!'));

client.on('disconnect', () => console.log('Disconnected! Attempting reconnect...'));

client.on('reconnecting', () => console.log('Reconnecting...'));

client.on('message', async msg => { 
	if (msg.author.bot) return undefined;
	if (!msg.content.startsWith(PREFIX)) return undefined;

	const args = msg.content.split(' ');
	const searchString = args.slice(1).join(' ');
	const url = args[1] ? args[1].replace(/<(.+)>/g, '$1') : '';
	const serverQueue = queue.get(msg.guild.id);

	let command = msg.content.toLowerCase().split(' ')[0];
	command = command.slice(PREFIX.length)

	if(msg.content === `${PREFIX}mping`){
		msg.channel.send(`${Math.round(client.ping)}ms :ping_pong:`)
	}
	
	if (msg.content.startsWith(`${PREFIX}play`)) {
		const voiceChannel = msg.member.voiceChannel;
		if (!voiceChannel) return msg.channel.send(':x: You must be in a voice channel!');
		const permissions = voiceChannel.permissionsFor(msg.client.user);
		if (!permissions.has('CONNECT')) {
			return msg.channel.send(':x: Missing permission to connect to the voice channel!');
		}
		if (!permissions.has('SPEAK')) {
			return msg.channel.send(':x: Missing permission to speak in the voice channel!');
		}

		if (url.match(/^https?:\/\/(www.youtube.com|youtube.com)\/playlist(.*)$/)) {
			const playlist = await youtube.getPlaylist(url);
			const videos = await playlist.getVideos();
			for (const video of Object.values(videos)) {
				const video2 = await youtube.getVideoByID(video.id);
				await handleVideo(video2, msg, voiceChannel, true);
			}
			return msg.channel.send(`✅ Playlist: **${playlist.title}** has been added to the queue!`);
		} else {
			try {
				var video = await youtube.getVideo(url);
			} catch (error) {
				try {
					var videos = await youtube.searchVideos(searchString, 10);
					let index = 0;
					msg.channel.send(`
                    __**Song selection:**__
                    ${videos.map(video2 => `**${++index} -** ${video2.title}`).join('\n')}
                    Please provide a value to select one of the search results ranging from 1-10.
					`);
					try {
						var response = await msg.channel.awaitMessages(msg2 => msg2.content > 0 && msg2.content < 11, {
							maxMatches: 1,
							time: 10000,
							errors: ['time']
						});
					} catch (err) {
						console.error(err);
						return msg.channel.send(':x: No or invalid value entered, cancelling video selection.');
					}
					const videoIndex = parseInt(response.first().content);
					var video = await youtube.getVideoByID(videos[videoIndex - 1].id);
				} catch (err) {
					console.error(err);
					return msg.channel.send(':x: I could not obtain any search results.');
				}
			}
			return handleVideo(video, msg, voiceChannel);
		}
	} else if (msg.content.startsWith(`${PREFIX}skip`)) {
		if (!msg.member.voiceChannel) return msg.channel.send(':x: You are not in a voice channel!');
		if (!serverQueue) return msg.channel.send(':x: here is nothing playing that I could skip for you.');
		serverQueue.connection.dispatcher.end(':track_next:  **Skipping...**');
		return undefined;
	} else if (msg.content.startsWith(`${PREFIX}stop`)) {
		if (!msg.member.voiceChannel) return msg.channel.send(':x: You are not in a voice channel!');
		if (!serverQueue) return msg.channel.send(':x: There is nothing playing that I could stop for you.');
		serverQueue.songs = [];
		serverQueue.connection.dispatcher.end(':stop_button: **Stopped**');
		return undefined;
	} else if (msg.content.startsWith(`${PREFIX}volume`)) {
		if (!msg.member.voiceChannel) return msg.channel.send('You are not in a voice channel!');
		if (!serverQueue) return msg.channel.send('There is nothing playing.');
		if (!args[2]) return msg.channel.send(`:control_knobs: The current volume is: **${serverQueue.volume}**`);
		serverQueue.volume = args[2];
		serverQueue.connection.dispatcher.setVolumeLogarithmic(args[2] / 5);
		return msg.channel.send(`:control_knobs: I set the volume to: **${args[2]}**`);
	} else if (msg.content.startsWith(`${PREFIX}np`)) {
		if (!serverQueue) return msg.channel.send('There is nothing playing.');
		return msg.channel.send(`🎶 Now playing: **${serverQueue.songs[0].title}**`);
	} else if (msg.content.startsWith(`${PREFIX}queue`)) {
		if (!serverQueue) return msg.channel.send(':x: There is nothing playing.');
		return msg.channel.send(`
                __**Song queue:**__
                ${serverQueue.songs.map(song => `**-** ${song.title}`).join('\n')}
                **Now playing:** ${serverQueue.songs[0].title}
		`);
	} else if (msg.content.startsWith(`${PREFIX}pause`)) {
		if (serverQueue && serverQueue.playing) {
			serverQueue.playing = false;
			serverQueue.connection.dispatcher.pause();
			return msg.channel.send('⏸ ***Paused***');
		}
		return msg.channel.send(':x: There is nothing playing.');
	} else if (msg.content.startsWith(`${PREFIX}resume`)) {
		if (serverQueue && !serverQueue.playing) {
			serverQueue.playing = true;
			serverQueue.connection.dispatcher.resume();
			return msg.channel.send(':arrow_forward: ***Resumed***');
		}
		return msg.channel.send(':x: There is nothing playing.');
	}

	return undefined;
});

async function handleVideo(video, msg, voiceChannel, playlist = false) {
	const serverQueue = queue.get(msg.guild.id);
	console.log(video);
	const song = {
		id: video.id,
		title: Util.escapeMarkdown(video.title),
		url: `https://www.youtube.com/watch?v=${video.id}`
	};
	if (!serverQueue) {
		const queueConstruct = {
			textChannel: msg.channel,
			voiceChannel: voiceChannel,
			connection: null,
			songs: [],
			volume: 5,
			playing: true
		};
		queue.set(msg.guild.id, queueConstruct);

		queueConstruct.songs.push(song);

		try {
			var connection = await voiceChannel.join();
			queueConstruct.connection = connection;
			play(msg.guild, queueConstruct.songs[0]);
		} catch (error) {
			console.error(`:x: I could not join the voice channel: ${error}`);
			queue.delete(msg.guild.id);
			return msg.channel.send(`:x: I could not join the voice channel: ${error}`);
		}
	} else {
		serverQueue.songs.push(song);
		console.log(serverQueue.songs);
		if (playlist) return undefined;
		else return msg.channel.send(`✅ **${song.title}** has been added to the queue!`);
	}
	return undefined;
}

function play(guild, song) {
	const serverQueue = queue.get(guild.id);

	if (!song) {
		serverQueue.voiceChannel.leave();
		queue.delete(guild.id);
		return;
	}
	console.log(serverQueue.songs);

	const dispatcher = serverQueue.connection.playStream(ytdl(song.url))
		.on('end', reason => {
			if (reason === 'Stream is not generating quickly enough.') console.log('Song ended.');
			else console.log(reason);
			serverQueue.songs.shift();
			play(guild, serverQueue.songs[0]);
		})
		.on('error', error => console.error(error));
	dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);

	serverQueue.textChannel.send(`🎶 Start playing: **${song.title}**`);
}

client.login(TOKEN);
