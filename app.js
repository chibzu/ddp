import { h, Component, render } from './preact.js';

const ClientActions = {
  SuggestSong: 11,
  VoteYay: 12,
  VoteNay: 13,
}

const speak = (message) => {
  speechSynthesis.speak(new SpeechSynthesisUtterance(message));
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
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.voteDeadline !== 0 && this.state.voteDeadline === 0 && this.state.videoIDToPlay === "") {
      speak("Vote has failed. The voting floor will reopen shortly.");
    }
  }

  componentDidMount() {
    const ws = new WebSocket('ws://localhost:8085');
    ws.addEventListener('open', () => {
      ws.addEventListener('message', (data) => {
        console.log("Received message:", data.data);
        this.setState(JSON.parse(data.data));
      });

      ws.addEventListener('close', (data) => {
        console.log("Server shutdown");
        setTimeout(() => { location.reload() }, 1000);
      });
    });
    this.ws = ws;
  }

  render() {
    return [
      h('h1', null, 'Welcome to the Democratic Dance Party'),
      h(SongSuggestion, { title: this.state.currentSuggestion, thumbnail: this.state.currentSuggestionThumbnail }),
      h(SubmitSong, { ws: this.ws }),
      h(BallotBox, { ws: this.ws, voteDeadline: this.state.voteDeadline }),
      h(Player, { videoIDToPlay: this.state.videoIDToPlay }),
    ];
  }
}

 class Player extends Component {
   componentDidUpdate(prevProps) {
     if (prevProps.videoIDToPlay !== this.props.videoIDToPlay && this.props.videoIDToPlay !== "" && ytReady) {
       speak("Vote has passed. Enjoy your democratically appointed jam.");
       this.player = new YT.Player('player', {
         playerVars: { 'controls': 0, 'autoplay': 1 },
         height: '390',
         width: '640',
         videoId: this.props.videoIDToPlay,
         events: {
           // 'onReady': (event) => { event.target.playVideo(); },
           //'onStateChange': onPlayerStateChange
         }
       });
     }
   }

   render() {
     return h('div', { id: 'player' });
   }
 }

class SubmitSong extends Component {
  constructor() {
    super();
    this.state = { videoID: 'RawsoZjbHHY' };
  }

  onSubmit = () => {
    this.props.ws.send(JSON.stringify({ action: ClientActions.SuggestSong, videoID: this.state.videoID }));
  }

  onChange = (evt) => {
    this.setState({videoID: evt.currentTarget.value });
  }

  render() {
    return h('div', null,
      h('input', { type: 'text', value: this.state.videoID, onChange: this.onChange }),
      h('button', { onClick: this.onSubmit }, 'submit'),
    )
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

    return h('div', null,
      h('img', { src: this.props.thumbnail, class: 'thumbnail' }),
      h('h4', null, this.props.title),
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
  )
  }
}

render(h(App), document.body);

let player;
function onYouTubeIframeAPIReady() {
  ytReady = true;
  // debugger;
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
