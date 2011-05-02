#!/usr/local/bin/node

var http = require('http')
  , url = require('url')
  , fs = require('fs')
  , io = require('socket.io')
  , sys = require(process.binding('natives').util ? 'util' : 'sys')
  , server;

// Hi my name is Node.js, I'll be your server today
server = http.createServer(function(req, res){
  var path = url.parse(req.url).pathname;
  //log(path);
  if (path == "/") path = "/index.html";

  fs.readFile(__dirname + path, function(err, data){
    if (err) return send404(res);

    var doctype = path.split('.');
    doctype = doctype[doctype.length-1];

    var contentType = 'text/plain';

    if (doctype == 'html') contentType = 'text/html';
    else if (doctype == 'js') contentType = 'text/javascript';
    else if (doctype == 'css') contentType = 'text/css';

    res.writeHead(200, {'contentType': contentType})
    res.write(data, 'utf8');
    res.end();
  });
}),

send404 = function(res){
  res.writeHead(404);
  res.write('404');
  res.end();
};

server.listen(9980); // 9980: duostack's experimental websockets port

// Socket.IO, I choose you
var io = io.listen(server);

sessions = []; // list of all sessions
queue = []; // list of all players waiting to play, in order
// any sessions not in queue are spectators
var player1 = 0, player2 = 0; // current players

// tidier helper function with session checking to prevent send errors
function send(client, message){
  if (contains(sessions, client)) io.clients[client].send(message);
}

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

// start paddles off at midcourt
var p1TargetY = .5,
    p1LastY = .5,
    p2TargetY = .5,
    p2LastY = .5;

function rnd(val) {
	return Math.round(val*100)/100;
}

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

    // receive and store player's target position
    if (msg.type == 'move') {
      if (msg.which == 'p1') {
        p1TargetY = msg.y;
      } else if (msg.which == 'p2') {
        p2TargetY = msg.y;
      }
    }

    // receive and broadcast paddle data
    // why can't i broadcast this straight from the player?
    if (msg.type == 'pmove') {
      //log("pmove, which: "+msg.which+", pos: "+rnd(msg.pos)+", goal: "+rnd(msg.goal));
      log("pmove, which: "+msg.which+", goal: "+rnd(msg.goal));
      //io.broadcast({type: 'pmove', which:msg.which, pos:msg.pos, goal:msg.goal});
      //io.broadcast({type: 'pmove', which:msg.which, goal:msg.goal});
      io.broadcast({type: 'pmove', which:msg.which, pos:msg.pos, goal:msg.goal});
    }

    if (msg.type == 'score') {
      if (msg.which == 'p1' && p1scored == 0) {
				p1scored = 1;
				score1++;
				score();
      } else if (msg.which == 'p2' && p2scored == 0) {
				p2scored = 1;
				score2++;
				score();
      }
    }

		if (msg.type == 'return') {
			if ( msg.which == 'p1' && p1returned == 0) {
				p1returned = 1;
				p2returned = 0;
			} else if (msg.which == 'p2' && p2returned == 0) {
				p2returned = 1;
				p1returned = 0;
			} else {
				log("DOUBLE RETURN");
				return false;
			}
			startx = msg.startx;
			starty = msg.starty;
	
			log(Math.round(client.sessionId/100000000000000)+": "+msg.which+" RETURN1");
			log(' startx: '+rnd(startx)+', starty: '+rnd(starty)+', angle: '+rnd(msg.angle)+", p1returned: "+p1returned+", p2returned: "+p2returned);
	
	//log(Math.round(client.sessionId/100000000000000)+": "+msg.which+' RETURN2 - startx: '+rnd(startx)+', starty: '+rnd(starty)+', angle: '+rnd(msg.angle));

			deltax *= -1.1; // switch directions and increase speed, normal: -1.1

			var maxSpeed = 15; // normal: 15
			deltax = Math.min(deltax, maxSpeed);
			deltax = Math.max(deltax, -1 * maxSpeed);

			deltay = english(msg.angle);
			moveBall();

		}

    // session announces readiness to play
    if (msg.type == 'ready') {
      if (!hasAttr(queue, 'id', client.sessionId)) { // prevent double additions
        log('ready: '+msg.name+' '+client.sessionId)

        // player object definition
        player = {id:client.sessionId, name:msg.name, wins:0, losses:0}

        // add player to waiting list
        queue.push(player);
        send(client.sessionId, {type:'html', which:'position', html:queue.length});
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

    }

    if (msg.type == 'watching') {
      updateSpectatorCount();
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
    	playing = false;
    	gameOn = false;
      var statusMsg = queue[0].name + ' - WAITING FOR CHALLENGER';
      send(queue[0].id, {type:'html', which:'status', html:statusMsg});
    }
  });
});

// move ball
function moveBall() {
	log('  moveBall: startx: '+rnd(startx)+', starty: '+rnd(starty)+', deltax: '+rnd(deltax)+', deltay: '+rnd(deltay));

	io.broadcast({type:'moveBall', startx:startx, starty:starty, deltax:deltax, deltay:deltay});
}

// helper function to approximate python's 'is in'
function contains(a, obj) {
  var i = a.length;
  while (i--) { if (a[i] == obj) return true; }
  return false;
}

function oldContains(arr, i) {
  for(x in arr) {
    if(arr[x] === i){
      return true;
    }
  }
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

var p1pos = 50, p2pos = 50;

var p1heartBeat = false, p2heartBeat = false;
var p1skippedBeat = 0, p2skippedBeat = 0;

var getSet = false, gameOn = false, playing = false, point = false;
var playLoopID = false, resetID = false, newgameID = false;

var score1 = 0, score2 = 0;
var p1scored = 0, p2scored = 0;

// game settings
var delay = 50; // ms between updates (50)
var maxScore = 2;
var flatline = 25; // maximum allowable number of skipped heartBeats (25)
var resetDelay = 500 // delay between volleys (2000)
var newgameDelay = 500 // delay between games (2000)

// flip a coin to see who serves
var deltax = (Math.random() < .5 ? -1 : 1);
var deltay = 0;

var p1returned = 0;
var p2returned = 0;

updateScores();

function score() {
	log('score');
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
    return false;
  }
  if (contains(sessions, player2.id)) {
    send(player2.id, { type:'playing', paddle:'p2', delay:delay });
    send(player2.id, { type:'display', alert:'PLAYER 2'});
  } else { // player2 not connected, abort and reset
    var idx = queue.indexOf(player2);
    if (idx != -1) queue.splice(idx, 1);
    player2 = 0;
    newgame(0);
    return false;
  }

  io.broadcast({type:'newgame', player1:player1.name, player2:player2.name});
  var statusmsg = player1.name + ' - PLAYING';
  send(player1.id, {type:'html', which:'status', html:statusmsg});
  var statusmsg = player2.name + ' - PLAYING';
  send(player2.id, {type:'html', which:'status', html:statusmsg});

  updateQueuePosition();


  score1 = 0;
  score2 = 0;
  // update scores
  updateScores();

  // start paddles
  if (!playing) {
    log(' !PLAYING');

    getSet = true;
    if (!playLoopID) {
	    log(' NO PLAYLOOP: starting');
      playLoopID = setTimeout(playLoop, delay, 'NEWGAME');
    } else log('PROB: playloop already going');

    // start gameplay
    if (resetID) {
      clearTimeout(resetID);
    }
    resetID = setTimeout( reset, resetDelay );

  } else {
    log(' PROB: already playing');
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

// master event loop
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
/*
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
*/
  if (playing || getSet) {
		//movePaddles();
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
		// repeat
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
    log(winner.name+": "+score1+" "+loser.name+": "+score2);
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
  log('\n*RESET* ');
  if (playing || !gameOn || !newgame) {
    log(' false reset: playing: '+playing+', gameOn: '+gameOn);
    return false;
  }
  if (queue.length < 2) {
    log('Awaiting another player...');
    return 0;
  }

  // determine who won coin toss/game/volley
  if (p1scored) deltax = Math.abs(deltax);
  if (p2scored) deltax = Math.abs(deltax) * -1;
  p1scored = 0;
  p2scored = 0;
  p1returned = 0;
  p2returned = 0;

  if (deltax < 0) { // p2 is serving
    send(player1.id, {type:'collide', value:true});
    send(player2.id, {type:'collide', value:false});
  } else {          // p1 is serving
    send(player2.id, {type:'collide', value:true});
    send(player1.id, {type:'collide', value:false});
  }

  deltax /= Math.abs(deltax); // set to 1 while keeping sign
  deltay = 0;
  startx = 50, starty = 50;

	//log("serving, p1returned: "+p1returned+", p2returned: "+p2returned);
	// serve ball
	moveBall();

  getset = false;
  playing = true;
  resetID = false;
  //log(' reset END');
}

// calculate paddle position based on last and goal positions
function movePaddle(which, targetY, lastY) {

  // get abs of distance since last update
  var delta = lastY - targetY;

  // minimum movement: 1%
  if (Math.abs(delta) < .01) {
    return false;
  }

  // speed limit: 4%
  var delta1 = Math.min(.04, Math.abs(delta));

  // using a second delta so we can keep the sign
  // now set delta1 to sign of delta
  delta1 *= (delta < 0 ? -1 : 1);
  // calculate new fractional position
  targetY = lastY - delta1;

  // keep in court
  targetY = Math.min(targetY, .92);
  targetY = Math.max(targetY, 0);

  // record for posterity
  lastY = targetY;

  // convert to percent and send
  sendY = targetY*100;

  if (which == 'p1') {
    p1pos = sendY;
    p1LastY = lastY;
  } else {
    p2pos = sendY;
    p2LastY = lastY;
  }
}

function returnBall(which, angle) {
	deltay = english(diff);
}

function movePaddles() {
  movePaddle('p1', p1TargetY, p1LastY);
  movePaddle('p2', p2TargetY, p2LastY);

  io.broadcast({type:'move', p1pos:p1pos, p2pos:p2pos});
}

function movePaddle2(which, pos, goal) {
	time = 
  io.broadcast({type:'move', which:which, pos:pos, goal:goal, time:time});
}

// returns ball at an angle based on point of contact with paddle
function english(yval) {
  var yfac = 1.5; // angle extremeness tuner

	// convert from 0..11.458 range to 0..100
  yval *= 8.727;

  if (yval < 0) deltay = -1 * yfac; // edge not as good as corner
  else if (yval < 10) deltay = -3 * yfac; // corner better than edge
  else if (yval < 20) deltay = -1.25 * yfac;
  else if (yval < 30) deltay = -.8333 * yfac;
  else if (yval < 40) deltay = -.41666 * yfac;
  else if (yval < 49) deltay = -.1 * yfac;
  else if (yval < 52) deltay = 0;
  else if (yval < 60) deltay = .1 * yfac;
  else if (yval < 70) deltay = .41666 * yfac;
  else if (yval < 80) deltay = .83333 * yfac;
  else if (yval < 90) deltay = 1.25 * yfac;
  else if (yval < 100) deltay = 3 * yfac;
  else deltay = 1 * yfac;
  return deltay;
}