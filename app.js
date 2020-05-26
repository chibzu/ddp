import { h, Component, render } from './preact.js';

const ClientActions = {
  SuggestSong: 11,
  VoteYay: 12,
  VoteNay: 13,
  VoteFire: 14,
  PlaybackDone: 15,
}

const speak = (message, callback) => {
  const utterance = new SpeechSynthesisUtterance(message);
  if (callback) {
    utterance.addEventListener("end", callback);
  }

  speechSynthesis.speak(utterance);
}

let ytReady = false;

class App extends Component {
  constructor() {
    super();
    this.state = {
      currentSuggestion: "",
      currentSuggestionThumbnail: "",
      videoIDToPlay: "",
      lastVoteTime: 0,
      votesNeeded: 0,
      voteDeadline: 0,
      citizens: 0,
      votedMap: {},
      fireCount: 0,
      fraudDetected: false,
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.voteDeadline !== 0 && this.state.voteDeadline === 0 && this.state.videoIDToPlay === "") {
      speak("Vote has failed. The voting floor will reopen shortly.");
    }
  }

  componentDidMount() {
    const ws = new WebSocket(`ws://${location.hostname}:8085`);
    ws.addEventListener('open', () => {
      ws.addEventListener('message', (data) => {
        console.log("Received message:");
        console.log(JSON.stringify(JSON.parse(data.data), null, 2));
        this.setState(JSON.parse(data.data));
      });

      ws.addEventListener('close', (data) => {
        setTimeout(() => { location.reload() }, 1000);
      });
    });
    this.ws = ws;
    window.admin = (message) => { ws.send(message); }

    const fraudDetector = new BroadcastChannel('fraud_detector');
    fraudDetector.addEventListener("message", (evt) => {
      if (evt.data === "pong") {
        this.setState({ fraudDetected: true });
      } else {
        fraudDetector.postMessage("pong");
      }
    });
    fraudDetector.postMessage("ping");

  }

  render() {
    if (this.state.fraudDetected) {
      return h('div', { class: 'fraud-alert' }, "VOTER FRAUD DETECTED");
    }


    return h('div', { class: 'main' },
      h('h1', { key: 'header' }, 'Welcome to the Democratic Dance Party'),
      h(SubmitSong, { key: 'submit', ws: this.ws, currentSuggestion: this.state.currentSuggestion, videoIDToPlay: this.state.videoIDToPlay }),
      h(SongSuggestion, { key: 'suggestion', title: this.state.currentSuggestion, thumbnail: this.state.currentSuggestionThumbnail, votesNeeded: this.state.votesNeeded, votedMap: this.state.votedMap }),
      h(BallotBox, { key: 'ballot', ws: this.ws, voteDeadline: this.state.voteDeadline }),
      h(Player, { key: 'player', videoIDToPlay: this.state.videoIDToPlay, ws: this.ws, }),
      h(CitizenCount, { key: 'citizen-count', citizens: this.state.citizens }),
      h(FireLayer, { key: 'fire-layer', count: this.state.fireCount }),
    );
  }
}

 class Player extends Component {
   voteFire = () => {
     this.props.ws.send(JSON.stringify({ action: ClientActions.VoteFire }));
   }

   componentDidUpdate(prevProps) {
     if (prevProps.videoIDToPlay !== this.props.videoIDToPlay && this.props.videoIDToPlay !== "") {
       const initPlayer = function(autoplay) {
         this.player = new YT.Player('player', {
           playerVars: { controls: 0, autoplay: autoplay, origin: location.origin },
           height: '390',
           width: '640',
           videoId: this.props.videoIDToPlay,
           events: {
             // 'onReady': (event) => { event.target.playVideo(); },
             //'onStateChange': onPlayerStateChange
           }
         });
       }.bind(this);

       if (ytReady) { initPlayer(0); }
       else {
         setTimeout(function() {
           initPlayer(1);
         }.bind(this), 1000);
       }

       speak("Vote has passed. Enjoy your democratically appointed jam.", () => {
         this.player.playVideo();
       });
     }

     if (prevProps.videoIDToPlay !== this.props.videoIDToPlay && this.props.videoIDToPlay === "") {
       speak("The democratic dance session has ended. The voting floor will reopen shortly.");
     }
   }

   render() {
     if (this.props.videoIDToPlay === "") { return null; }

     return h('div', { class: 'player-layout' },
       h('div', { key: 'player-container', class: 'player-container' }, h('div', { id: 'player' })),
       h('button', { class: 'fire-button', onClick: this.voteFire }, '🔥'),
     );
   }
 }

class SubmitSong extends Component {
  constructor() {
    super();
    this.state = { videoID: '' };
  }

  onSubmit = () => {
    if (this.state.videoID === '') { return; }
    this.props.ws.send(JSON.stringify({ action: ClientActions.SuggestSong, videoID: this.state.videoID }));
  }

  onChange = (evt) => {
    let ytCode = evt.currentTarget.value;
    const match = ytCode.match(/[\?\&]v=([a-zA-Z0-9_-]+)/);
    if (match) {
      ytCode = match[1];
    }

    this.setState({videoID: ytCode });
  }

  render() {
    if (this.props.currentSuggestion !== "" || this.props.videoIDToPlay !== "") { return null; }

    return h('div', null,
      h('div', { class: 'submit-cta'},
        h('img', { class: 'vote-icon', src: 'vote.svg' })
      ),
      h('div', { class: 'submit-song-form' },
        h('input', { type: 'text', value: this.state.videoID, onKeyUp: this.onChange, placeholder: 'YT video code' }),
        h('button', { onClick: this.onSubmit }, 'submit'),
      )
    );
  }
}

class SongSuggestion extends Component {
  componentDidUpdate(prevProps) {
    if (prevProps.title !== this.props.title && this.props.title !== "") {
      speak(`A citizen has suggested the song ${this.props.title}. Cast your vote.`);
    }
  }

  render() {
    if (this.props.title === '' || this.props.thumbnail === '') { return null; }

    const yayVotes = Object.values(this.props.votedMap).filter((vote) => vote).length;
    const nayVotes = Object.values(this.props.votedMap).filter((vote) => !vote).length;

    return h('div', { class: 'song-preview' },
      h('img', { src: this.props.thumbnail, class: 'thumbnail' }),
      h('h4', null, this.props.title),
      h('h4', null, `Yay votes required: ${this.props.votesNeeded}`),
      h('h4', null, `Yay: ${yayVotes} Nay: ${nayVotes}`),
    );
  }
}

class BallotBox extends Component {
  voteYay = () => {
    this.props.ws.send(JSON.stringify({ action: ClientActions.VoteYay }));
  }
  voteNay = () => {
    this.props.ws.send(JSON.stringify({ action: ClientActions.VoteNay }));
  }

  render() {
    if (this.props.voteDeadline === 0) { return null; }

    return h('div', null,
      h('button', { onClick: this.voteYay }, "Yay"),
      h('button', { onClick: this.voteNay }, "Nay"),
    );
  }
}

class CitizenCount extends Component {
  render () {
    return h('div', { class: 'citizen-count' }, `Population: ${this.props.citizens}`);
  }
}

class FireLayer extends Component {
  constructor() {
    super();
    this.xCoords = [];
  }

  render() {
    while (this.xCoords.length < this.props.count) {
      this.xCoords.push(Math.floor(Math.random() * (window.innerWidth - 0)) + 0);
    }

    const children = [];
    for(let i=0; i<this.props.count; i++) {
      children.push(h('span', { key: i, class: 'fire', style: { left: `${this.xCoords[i]}px`} }, '🔥'));
    }

    return h('div', { class: 'fire-layer' }, children);
  }
}

render(h(App), document.querySelector("#app"));

let player;
function onYouTubeIframeAPIReady() {
  ytReady = true;
  // player = new YT.Player('player', {
  //   height: '390',
  //   width: '640',
  //   videoId: 'M7lc1UVf-VE',
  //   events: {
  //     //'onReady': onPlayerReady,
  //     //'onStateChange': onPlayerStateChange
  //   }
  // });
}

window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;
