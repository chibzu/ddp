const WebSocket = require('ws');
const { exec } = require('child_process');
const { JSDOM } = require('jsdom');
const { v4: uuid } = require('uuid');

const VotingTimeMS = 90 * 1000;

const wss = new WebSocket.Server({
  port: 8085,
  noServer: true,
  clientTracking: true,
});

let AppState = {
  currentSuggestion: "",
  currentSuggestionThumbnail: "",
  videoIDToPlay: "",
  lastVoteTime: 0,
  votesNeeded: 0,
  voteDeadline: 0,
  citizens: 0,
  votedMap: {},
  fireCount: 0,
};

const ClientActions = {
  SuggestSong: 11,
  VoteYay: 12,
  VoteNay: 13,
  VoteFire: 14,
  PlaybackDone: 15,
}

const clients = [];

const broadcast = () => {
  for (client of wss.clients) {
    client.send(JSON.stringify(AppState));
  }
}

let votingTimer = null;
let pendingVideoID = "";
let durationMS = 0;
let blacklist = [];

wss.on('connection', function connection(socket) {
  const ws = socket;
  ws.id = uuid();
  console.log("Client Connected");
  AppState = {
    ...AppState,
    citizens: wss.clients.size,
  }
  broadcast();

  ws.on('message', function message(data) {
    if (data === "reset") {
      AppState = {
        currentSuggestion: "",
        currentSuggestionThumbnail: "",
        videoIDToPlay: "",
        lastVoteTime: 0,
        votesNeeded: 0,
        voteDeadline: 0,
        citizens: 0,
        votedMap: {},
        fireCount: 0,
      };
      broadcast();
      return;
    }

    const message = JSON.parse(data);

    let votes;
    switch (message.action) {
      case ClientActions.SuggestSong:
        if (!/[a-zA-Z0-9_-]{1,11}/.test(message.videoID)) { break; }
        if (blacklist.includes(message.videoID)) { break; }
        pendingVideoID = message.videoID;
        exec(`curl "https://www.youtube.com/watch?v=${message.videoID}"`, (error, stdout, stderr) => {
          const ytPage = new JSDOM(stdout);
          const document = ytPage.window.document;
          const title = document.querySelector('meta[property="og:title"').content;
          const thumbnail = document.querySelector('meta[property="og:image"').content;

          votesNeeded = Math.floor(wss.clients.size / 2) + 1;
          voteDeadline = Date.now() + VotingTimeMS;
          lastVoteTime = Date.now();

          const durationIndex = stdout.indexOf('approxDurationMs');
          durationMs = parseInt(stdout.slice(durationIndex, stdout.indexOf(",", durationIndex)).match(/[0-9]+/)[0]);

          AppState = {
            ...AppState,
            currentSuggestion: title,
            currentSuggestionThumbnail: thumbnail,
            lastVoteTime: lastVoteTime,
            votesNeeded: votesNeeded,
            lastVoteTime: lastVoteTime,
            citizens: wss.clients.size,
            voteDeadline: voteDeadline,
          }
          broadcast();

          votingTimer = setTimeout(() => {
            console.log("Voting has failed");
            AppState = {
              ...AppState,
              currentSuggestion: "",
              currentSuggestionThumbnail: "",
              votesNeeded: 0,
              voteDeadline: 0,
              votedMap: {},
            }
            broadcast();
            votingTimer = null;
          }, VotingTimeMS);

        });
        break;

        case ClientActions.VoteYay:
          if (AppState.votedMap[this.id] !== undefined) { break; }

          AppState.votedMap[this.id] = true;

          votes = Object.values(AppState.votedMap);
          let yayVotes = votes.filter((vote) => vote).length;
          if (yayVotes >= AppState.votesNeeded) {
            console.log("Vote Has Passed");
            blacklist.unshift(pendingVideoID);
            blacklist = blacklist.slice(0, 5);
            AppState = {
              ...AppState,
              currentSuggestion: "",
              currentSuggestionThumbnail: "",
              votesNeeded: 0,
              voteDeadline: 0,
              votedMap: {},
              videoIDToPlay: pendingVideoID,
            }
            broadcast();
            if (votingTimer !== null) {
              clearTimeout(votingTimer);
              votingTimer = null;
            }
            setTimeout(() => {
              AppState = {
                currentSuggestion: "",
                currentSuggestionThumbnail: "",
                videoIDToPlay: "",
                lastVoteTime: 0,
                votesNeeded: 0,
                voteDeadline: 0,
                citizens: 0,
                votedMap: {},
                fireCount: 0,
              }
              broadcast();
            }, durationMs + 30000);
            break;
          }

          if (votes.length >= AppState.citizens) {
            AppState = {
              ...AppState,
              currentSuggestion: "",
              currentSuggestionThumbnail: "",
              votesNeeded: 0,
              voteDeadline: 0,
              votedMap: {},
            }
            broadcast();
            if (votingTimer !== null) {
              clearTimeout(votingTimer);
              votingTimer = null;
            }
            break;
          }

          broadcast();
          break;

        case ClientActions.VoteNay:
          if (AppState.votedMap[this.id] !== undefined) { break; }
          AppState.votedMap[this.id] = false;
          votes = Object.values(AppState.votedMap);

          if (votes.length >= AppState.citizens) {
            console.log("Vote Has Failed");
            AppState = {
              ...AppState,
              currentSuggestion: "",
              currentSuggestionThumbnail: "",
              votesNeeded: 0,
              voteDeadline: 0,
              votedMap: {},
            }
            broadcast();
            if (votingTimer !== null) {
              clearTimeout(votingTimer);
              votingTimer = null;
            }
            break;
          }
          broadcast();
          break;

        case ClientActions.VoteFire:
          console.log("Voted Fire");
          let newFireCount = AppState.fireCount + 1;
          AppState = {
            ...AppState,
            fireCount: newFireCount,
          }
          broadcast();
          break;
    }
  });

  ws.on('close', (number, reason) => {
    console.log("Client Disconnected");
    AppState = {
      ...AppState,
      citizens: wss.clients.size,
    }
    broadcast();
  });

});

console.log("DDP Server Started");
