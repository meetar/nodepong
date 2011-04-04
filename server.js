#!/usr/local/bin/node

var http = require('http')
  , url = require('url')
  , fs = require('fs')
  , io = require('socket.io')
  , sys = require(process.binding('natives').util ? 'util' : 'sys')
  , server;

server = http.createServer(function(req, res){
  var path = url.parse(req.url).pathname;

  fs.readFile(__dirname + path, function(err, data){
    if (err) return send404(res);

    var doctype = path.split('.');
    //log (path+' doctype: '+doctype);
    doctype = doctype[doctype.length-1];

    var contentType = 'text/plain';

    if (doctype == 'html') contentType = 'text/html';
    else if (doctype == 'js') contentType = 'text/javascript';
    else if (doctype == 'css') contentType = 'text/css';

    //log ('contype: '+contentType);

    //res.writeHead(200, {'contentType': contentType})
    res.writeHead(200, {'contentType': 'text/plain'})
    res.write(data, 'utf8');
    res.end();
  });
}),

send404 = function(res){
  res.writeHead(404);
  res.write('404');
  res.end();
};

server.listen(9980); // duostack's experimental websockets port

// socket.io, I choose you
var io = io.listen(server);

sessions = []; // list of all sessions
queue = []; // list of all players waiting to play, in order
// any sessions not in queue are spectators
var player1 = 0, player2 = 0; // current players

// tidier helper function with session checking to prevent send errors
function send(client, message){
  if (contains(sessions, client)) io.clients[client].send(message);
}

// extend Object to show number of objects within
Object.size = function(obj) {
  var size = 0, key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) size++;
  }
  return size;
};

// gets ordinal for number
function getOrdinal(number) {
  var ordinal = 'th';
  var lastchar = String(number).charAt(String(number).length-1);
  if (lastchar == '1') {ordinal = 'st'}
  else if (lastchar == '2') {ordinal = 'nd'}
  else if (lastchar == '3') {ordinal = 'rd'}
  ordinal = String(number)+ordinal;
  return ordinal;
}

// updates "4th in line" display
function updateQueuePosition() {
  for (x in queue) {
    if (x != 0 && x != 1) { // don't update status of the current players
      if (x == 2) {
        var statusmsg = queue[x].name+ ' - NEXT IN LINE!';
      } else {
        var y = parseInt(x)-1;
        log('updating queue['+x+']: '+queue[x]+': '+queue[x].name +': '+getOrdinal(y));
        var statusmsg = queue[x].name+ ' - '+getOrdinal(y) + ' IN LINE';
      }
      send(queue[x].id, {type:'html', which:'status', html:statusmsg});
    }
  }
}

// ***** CLIENT CONNECT ***** //

io.on('connection', function(client){
  if (!contains(sessions, client.sessionId)) { // prevent double connections
    sessions.push(client.sessionId);
    log('\nCONNECTION NUMBER '+sessions.length+': '+client.sessionId);
  }

  client.on('message', function(msg){
    // to log all messages from clients:
    //var logmsg = 'msg: ';
    //for (i in msg) { logmsg += (i+':'+msg[i]+' '); }
    //log(logmsg);

    // receive player's position and prepare for broadcast
    if (msg.type == 'move') {
      if (msg.which == 'p1') p1pos = msg.y;
      else if (msg.which == 'p2') p2pos = msg.y;
    }

    // session announces readiness to play
    if (msg.type == 'ready') {
      if (!hasAttr(queue, 'id', client.sessionId)) { // prevent double additions
        log('ready: '+msg.name+' '+client.sessionId)

        // player object definition
        player = {id:client.sessionId, name:msg.name, wins:0, losses:0}

        // add player to waiting list
        queue.push(player);
        send(client.sessionId, {type:'position', position:queue.length});
        send(client.sessionId, {type:'display', alert:'WELCOME '+player.name});

        // populate leaderboard
        if (queue.length < 10) {
          updateLeaderboard();
        }

        updatePlayerCount();
        updateSpectatorCount();

      }

      if (queue.length == 1) { // lonely player1...
        setTimeout(function() {send(client.sessionId, {type:'display', alert:'WAITING FOR CHALLENGER'})}, 2000);
        var statusmsg = player.name + ' - WAITING FOR CHALLENGER';
        send(client.sessionId, {type:'html', which:'status', html:statusmsg});
      } else if (queue.length == 2) {
        var statusmsg = player.name+ ' - READY TO PLAY';
        send(client.sessionId, {type:'html', which:'status', html:statusmsg});
      } else {
        updateQueuePosition();
      }

      report(['gameOn', 'playing', 'newgameID']);
      log('queue length: '+queue.length);

      // second player! start new game!
      if (queue.length > 1 && !gameOn && !newgameID) {
        log(' connect NEWGAME');
        newgameID = setTimeout(function() {newgame(2)}, newgameDelay );
      } else if (queue.length > 1 && !gameOn && newgame) { // claims game already triggered?
          setTimeout(function() { // give it 3 newgameDelays
            if (newgameID) newgame(3); // if newgameID still not reset, try to start a new game anyway
            else log('PROB NEWGAMEID STUCK');
          }, newgameDelay*3 );
      }

      /* possibly unnecessary - testing
      if (gameOn) { // reveal game already underway
        send(client.sessionId, {type:'css', which:'p1', property:'visibility', value:'visible'});
        send(client.sessionId, {type:'css', which:'p2', property:'visibility', value:'visible'});
        if (playing) {
          send(client.sessionId, {type:'css', which:'ball', property:'visibility', value:'visible'});
          send(client.sessionId, {type:'css', which:'centerline', property:'visibility', value:'visible'});
        }
      }
      */
    }

    if (msg.type == 'watching') {
      updateSpectatorCount();
    }

    if (msg.type == 'return') {
      if (!playing) {
        //log(' false return: not playing');
        return 0; // sometimes return is sent after score
      }
      //report(['ballx']);;
      if (Math.abs(ballx - 50) < 35) {
        //log(' false return: ball not at edge');
        return 0;
      }

      if (msg.which == 'p1') { // p1 return
        deltax = Math.abs(deltax);
        //send(player1.id, {type:'collide', value:false});
        //send(player2.id, {type:'collide', value:true});
      } else { // p2 return
        deltax = Math.abs(deltax) * -1;
        //send(player1.id, {type:'collide', value:true});
        //send(player2.id, {type:'collide', value:false});
      }

      var increase = 1.1; // normal: 1.1
      var maxSpeed = 15; // normal: 15
      if (deltax > 1) { deltax = Math.min(deltax * increase, maxSpeed); }
      else { deltax = Math.max(deltax * increase, -1 * maxSpeed); }

      deltay = msg.english;
    }

    if (msg.type == 'heartBeat') { // player not timing out, all's well
      //log('heartbeat:'+client.sessionId+', p1.id:'+player1.id+', p2.id:'+player2.id);
      if (client.sessionId == player1.id) p1heartBeat = true;
      else if (client.sessionId == player2.id) p2heartBeat = true;
    }

    if (msg.type == 'log') {
      log(client.sessionId+': '+msg.what);
    }
  });

  client.on('disconnect', function(){
    log('\nDISCONNECT: '+client.sessionId);

    // if playing, game over - disconnecter forfeits
    if ((client.sessionId == player1 || client.sessionId == player2)
        && gameOn) {
      gameover('forfeit', client.sessionId);
    }
    // client loses place in line
    var idx = queue.indexOf(hasAttr(queue, 'id', client.sessionId));
    if (idx != -1) {
      queue.splice(idx, 1);
      // update everyone's place in line
      updateQueuePosition();
    }
    var idx = sessions.indexOf(client.sessionId);
    if (idx != -1) sessions.splice(idx, 1);

    if (queue.length == 1) {
      var statusMsg = queue[0].name + ' - WAITING FOR CHALLENGER';
      send(queue[0].id, {type:'html', which:'status', html:statusMsg});
    }
  });
});

// helper function to approximate python's 'is in'
function contains(a, obj) {
  var i = a.length;
  while (i--) { if (a[i] == obj) return true; }
  return false;
}

// does obj contain a key with value val? if so return key
function hasAttr(obj, id, val) {
  for(x in obj) {
    for (y in obj[x]) {
      if (y == id && obj[x][y] == val) {return obj[x];}
    }
  }
  return false;
}

//**** GAME LOGIC ****//

// all values are percentages of their parents' dimensions, mostly of court
// most heights are percentages of courtheight, most widths of courtwidth
var courtWidth = 100, courtHeight = 100;

// not actually using paddleHeight or Width
var paddleHeight = 8.333, paddleWidth = 3.125, ballWidth = 1.5625, ballHeight = 2.08333;
var p1pos = courtHeight/2, p2pos = courtHeight/2;

var maxx = courtWidth-(ballWidth*2);
var maxy = courtHeight-(ballHeight*2);

var p1heartBeat = false, p2heartBeat = false;
var p1skippedBeat = 0, p2skippedBeat = 0;

var getSet = false, gameOn = false, playing = false, point = false;
var playLoopID = false, resetID = false, newgameID = false;

var volleys = 0;
var score1 = 0, score2 = 0;
var justScored = '';

// game settings
var delay = 50; // ms between updates (50)
var startSpeed = 1;
var maxScore = 2;
var flatline = 25; // maximum allowable number of skipped heartBeats (25)
var resetDelay = 2000 // delay between volleys (1000)
var newgameDelay = 2000 // delay between games (2000)

// flip a coin to see who serves
var deltax = (Math.random() < .5 ? -1 * startSpeed : startSpeed) * delay/50;
var deltay = 0;
var ballx = 0, bally = 0;

updateScores();

function score() {
  point = true;
  playing = false;
  updateScores();
}

function updateScores() {
  io.broadcast({type:'score', which:'score1', val:score1});
  io.broadcast({type:'score', which:'score2', val:score2});
}

var leaderboard = [];
var leaderboardHTML = '';
var leaders;

function eliminateDuplicates(array) {
  var newArray=new Array();

  label:for(var i=0; i<array.length;i++ ) {
    for(var j=0; j<newArray.length;j++ ) {
      if(newArray[j]==array[i]) continue label;
    }
    newArray[newArray.length] = array[i];
  }
  return newArray;
}

function contains(arr, i) {
  for(x in arr) {
    if(arr[x] === i){
      return true;
    }
  }
  return false;
}

function updateLeaderboard() {
  // combine queue with leaderboard
  leaders = queue.slice(0); // make a copy of the queue
  if (leaderboard.length != 0) leaders = leaders.concat(leaderboard);

  // remove duplicates
  leaders = eliminateDuplicates(leaders);

  // sort by wins
  leaders.sort(function(a, b){
   return b.wins-a.wins;
  })

  leaders = leaders.slice(0,10); // trim to top 10
  leaderboard = leaders.slice(0); // copy array for storage

  // generate leaderboard HTML and broadcast
  blanks = 10 - leaders.length; // how many blank lines?

  var scores = '';

  for (var x=0; x<leaders.length; x++) { // assemble leaderboard table
    class = (contains(sessions, leaders[x].id)) ? '\'name\'' : '\'disconame\'';
    scoreline = '<tr><td class=\'rank\'>'+String(parseInt(x)+1)+'.</td><td class='+class+'>'+leaders[x].name+'</td><td class=\'scor\'>'+leaders[x].wins+'</td></tr>\n'
    scores += scoreline;
  }
  for (x=0;x<blanks;x++) {
    blank = '<tr><td class=\'rank\'>'+String(leaders.length+x+1)+'.</td><td class=\'name\'>...</td><td class=\'scor\'>...</td></tr>\n'
    scores += blank;
  }
  leaderboardHTML = scores;
  io.broadcast({type:'html', which:'scoretable', html:leaderboardHTML});
}

function updatePlayerCount() {
  var numString = queue.length + ' player' + (queue.length > 1 ? 's' : '') + ' connected';
  io.broadcast({type:'html', which:'numberOfPlayers', html:numString});
}

function updateSpectatorCount() {
  var spectators = sessions.length - queue.length;
  var numString = ''
  if (spectators > 0) {
    numString = spectators + ' spectator' + (spectators > 1 ? 's' : '');
  } else {
    numString = 'no spectators';
}
  io.broadcast({type:'html', which:'numberOfSpectators', html:numString});
}

function log(x) { // shortcut function
  console.log(x);
}

function report(list) { // helper function
  msg = ''
  for (x in list) {
    msg += list[x]+': '+eval(list[x])+' | ';
  }
  log(msg);
}

// ***** NEW GAME ***** //

function newgame(id) {
  if (sessions.length < 2 || queue.length < 2) {
    log(' false start- sessions.length:'+sessions.length+', queue.length:'+queue.length);
    return false;
  }
  // assign unassigned players to unassigned player slots
  if (player1 == 0) { // for slot 1
    if (queue[0] != player1 && queue[0] != player2) {
      player1 = queue[0];
    } else if (queue[1] != player1 && queue[1] != player2) {
      player1 = queue[1];
    }
  }
  if (player2 == 0) { // same for slot 2
    if (queue[0] != player1 && queue[0] != player2) {
      player2 = queue[0];
    } else if (queue[1] != player1 && queue[1] != player2) {
      player2 = queue[1];
    }
  }

  log('\n*NEWGAME* '+id+' / PLAYERS: p1: '+player1.name+', p2: '+player2.name);

  if (contains(sessions, player1.id)) {
    send(player1.id, { type:'playing', paddle:'p1', delay:delay });
    send(player1.id, { type:'display', alert:'PLAYER 1'});
  } else { // player1 not connected, abort and reset
    var idx = queue.indexOf(player1);
    if (idx != -1) queue.splice(idx, 1);
    player1 = 0;
    newgame(0);
  }
  if (contains(sessions, player2.id)) {
    send(player2.id, { type:'playing', paddle:'p2', delay:delay });
    send(player2.id, { type:'display', alert:'PLAYER 2'});
  } else { // player2 not connected, abort and reset
    var idx = queue.indexOf(player2);
    if (idx != -1) queue.splice(idx, 1);
    player2 = 0;
    newgame(0);
  }

  io.broadcast({type:'newgame', player1:player1.name, player2:player2.name});
  var statusmsg = player1.name + ' - PLAYING';
  send(player1.id, {type:'html', which:'status', html:statusmsg});
  var statusmsg = player2.name + ' - PLAYING';
  send(player2.id, {type:'html', which:'status', html:statusmsg});

  updateQueuePosition();


  volleys = 0;
  score1 = 0;
  score2 = 0;
  // update scores
  updateScores();

  // start paddles
  if (!playing) {
    getSet = true;
    if (!playLoopID) {
      playLoopID = setTimeout(playLoop, delay, 'NEWGAME');
    } else log('PROB: playloop already going');

    // start gameplay
    if (resetID) {
      clearTimeout(resetID);
    }
    resetID = setTimeout( reset, resetDelay );

  } else {
    //log(' PROB: already playing');
    report(['playing', 'gameOn', 'point', 'player1.id', 'player2.id']);
    //return false;
  }

  gameOn = true;
  newgameID = false;
  //log(' newgame END');
}

// helper function
function setcss(which, property, value){
  io.broadcast({type:'css', which:which, property:property, value:value});
}

function playLoop(caller) {
  // make sure players are still connected and haven't lagged out --
  // sometimes takes awhile for disconnect to be triggered
  if (p1heartBeat == false) {
    p1skippedBeat++; //log('p1 SKIPPED: '+p1skippedBeat);
  } else {
    p1skippedBeat = 0;
  }
  if (p2heartBeat == false) {
    p2skippedBeat++; //log('p2 SKIPPED: '+p2skippedBeat);
  } else {
    p2skippedBeat = 0;
  }

  p1heartBeat = false;
  p2heartBeat = false;

  if (p1skippedBeat == flatline) {
    log('player 1 FLATLINE');
    gameover('forfeit', player1);
    return false;
  }
  if (p2skippedBeat == flatline) {
    log('player 2 FLATLINE');
    gameover('forfeit', player2);
    return false;
  }

  if (playing) {
    moveDivs();
  } else if (getSet) {
    io.broadcast({type:'move', p1pos:p1pos, p2pos:p2pos, ballx:null, bally:null});
  } else {
    log('playLoop broke');
  }
  if (point) {
    point = false;
    setcss('ball', 'visibility', 'hidden');

    if (score1 == maxScore || score2 == maxScore) {
      gameover('win', (score1 == maxScore) ? player1 : player2);
      return 0;
    } else if (!resetID) {
      resetID = setTimeout(reset, resetDelay);
    } else {
      log('PROB: already resetting');
    }
  }

  if (gameOn) {
    playLoopID = setTimeout(playLoop, delay, 'gameOn');
  } else {
    log('gameOn false: killing playLoop');
  }

  //report(['gameOn', 'getSet', 'playing']);
  playLoopID = false;
}

// GAME OVER
// type:'win'|'forfeit', player:[object Object]
function gameover(type, which) {
  //log('GAME OVER: '+type+', '+which.name);
  gameOn = false;
  playing = false;
  newgameID = false;

  io.broadcast({type:'endgame'});

  // WIN
  if (type == 'win') {
    winner = which;
    loser = (which == player1) ? player2 : player1;
    log(winner.name + ' WINS');
    send(winner.id, {type:'display', alert:'YOU WIN'});
    send(loser.id, {type:'display', alert:'YOU LOSE'});
    // broadcast to everybody except [winner, loser]
    io.broadcast({type:'display', alert:winner.name+' WINS', id:0}, [winner.id, loser.id]);

    // increment wins/losses
    winner.wins++;
    loser.losses++;

    // move loser to end of queue line
    var idx = queue.indexOf(loser);
    //log('loser idx:'+idx);
    if (idx != -1) {
      queue.splice(idx,1);
      queue.push(loser);
      var qmsg = '';
      for (x in queue) qmsg += ' '+queue[x].name;
      //log(queue.length+' in queue:'+qmsg);
    }

    // tag losing player slot for reassignment
    if (loser == player1) player1 = 0; else player2 = 0;

  // FORFEIT
  } else if (type == 'forfeit') {
    loser = which;
    winner = (which == player1) ? player2 : player1;

    log('FORFEIT: '+loser.id + ': '+loser.name);
    io.broadcast({type:'display', alert:loser.name+' FORFEITS'});

    winner.wins ++;

    // remove loser from queue and sessions
    var idx = queue.indexOf(loser);
    if (idx != -1) {
      log('removing from queue');
      queue.splice(idx,1);
      io.broadcast({type:'board', mode:'remove', remove:idx});
    } else {
      log('not in queue - can\'t remove');
    }
    var idx = sessions.indexOf(loser.id);
    if (idx != -1) sessions.splice(idx, 1);

    // tag losing player slot for reassignment
    if (loser == player1) player1 = 0; else player2 = 0;

    report(['sessions', 'queue']);
  }

  updateLeaderboard();
  updatePlayerCount();


  if (queue.length > 1) {
    //log('queue.length: '+queue.length+': '+queue);
    if (!newgameID) newgameID = setTimeout(function() {newgame(1)}, newgameDelay );
    else log('PROB: already newgame');
  } else if (queue.length == 1){
    var statusMsg = queue[0].name + ' - WAITING FOR CHALLENGER';
    send(queue[0].id, {type:'html', which:'status', html:statusMsg});
  }
}

function reset() {
  //log('\n*RESET* ');
  if (playing || !gameOn || !newgame) {
    log(' false reset: playing: '+playing+', gameOn: '+gameOn);
    return false;
  }
  if (queue.length < 2) {
    log('Awaiting another player...');
    return 0;
  }

  // determine who won coin toss/game/volley
  if (justScored == 'p1') deltax = Math.abs(deltax);
  if (justScored == 'p2') deltax = Math.abs(deltax) * -1;

  if (deltax < 0) { // p2 is serving
    send(player1.id, {type:'collide', value:true});
    send(player2.id, {type:'collide', value:false});
  } else {          // p1 is serving
    send(player2.id, {type:'collide', value:true});
    send(player1.id, {type:'collide', value:false});
  }

  deltax /= Math.abs(deltax); // set to 1 while keeping sign
  deltax *= delay/50; // keep same velocity, accounting for delay
  deltay = 0;
  ballx = courtWidth/2, bally = courtHeight/2;
  io.broadcast({type:'move', which:'ball', bally:bally, ballx:ballx});
  setcss('ball', 'visibility', 'visible');

  volleys ++;
  getset = false;
  playing = true;
  resetID = false;
  //log(' reset END');
}

function moveDivs() {
  ballx += deltax;
  bally += deltay;
  // keep ball in court
  ballx = Math.min(ballx, maxx);
  ballx = Math.max(ballx, 0);
  bally = Math.min(bally, maxy);
  bally = Math.max(bally, 0);

  // bounce off y walls
  if ( bally == 0 || bally == maxy ) deltay *= -1;

  io.broadcast({type:'move', p1pos:p1pos, p2pos:p2pos, bally:bally, ballx:ballx});

  // Test for wall collision

  // var to enable scoring - turn off to test movement
  var scoringOn = true;

  if (ballx == maxx && scoringOn) { // P1 point
    justScored = 'p1';
    score1 ++;
    score();
  } else if (ballx == 0 && scoringOn ) { // P2 point
    justScored = 'p2';
    score2 ++;
    score();
  }
}