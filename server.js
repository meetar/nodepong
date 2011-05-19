#!/usr/local/bin/node
// I don't remember why this is here

///////////////////////////////////
// NodePong 0.1b server.js
// MIT License (C) P Richardson 2011
// some portions of this code MIT License (C) LearnBoost 2010
// some portions of this code MIT License (C) Joyent 2010


///////////////////////////////////
//          SERVER CODE

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

server.listen(80); // http port

///////////////////////////////
//        SESSION CODE

// Socket.IO, I choose you
var io = io.listen(server);

sessions = []; // list of all sessions
queue = []; // list of all players waiting to play, in order;
spectators = [];
var player1 = 0, player2 = 0; // current players

// helper function with session checking to prevent send errors
function send(client, message){
  if (contains(sessions, client)) io.clients[client].send(message);
}



// ***** CLIENT CONNECT ***** //

io.on('connection', function(client){
  if (!contains(sessions, client.sessionId)) { // prevent double connections
    sessions.push(client.sessionId);
    log('\nCONNECTION NUMBER '+sessions.length+': '+client.sessionId);
  }
  
  if (gameOn) {
    send(client.sessionId, {type:'gameon', player1:player1.name, player2:player2.name});
  }
  
  updateLeaderboard(client.sessionId);
  updatePlayerCounts();

  // get current paddle positions and animate
  var connectTime = new Date(); // get current timestamp

  // for player 1
  var elapsedTime = connectTime - p1posTime;
  
  // paddles move 4% per 50ms
  var dist = p1goal - p1pos;
  var timeNeeded = Math.abs(dist/4*50); // total% / 4% * 50ms = total milliseconds to travel dist
  if (elapsedTime > timeNeeded ) {
    percentCompleted = 1;
    var currentPos = p1goal;
  } else {
    var percentCompleted = elapsedTime / timeNeeded;
    var currentPos = dist*percentCompleted + p1pos;
  }

  //report(['p1goal', 'p1pos']);
  //log('connectTime: '+connectTime.getTime());
  //log('p1posTime: '+p1posTime.getTime());
  //log('elapsedTime: '+elapsedTime);
  //log('dist: '+dist);
  //log('timeNeeded: '+timeNeeded);
  //log('percentCompleted: '+percentCompleted);
  //log('currentPos: '+currentPos);
  
  send(client.sessionId, {type:'movePaddle', which:'p1', pos:currentPos, goal:p1goal, init:true});

  // same for player 2
  var elapsedTime = connectTime - p2posTime;
  
  // paddles move 4% per 50ms
  var dist = p2goal - p2pos;
  var timeNeeded = Math.abs(dist/4*50); // total% / 4% * 50ms = total milliseconds to travel dist
  if (elapsedTime > timeNeeded ) {
    percentCompleted = 1;
    var currentPos = p2goal;
  } else {
    var percentCompleted = elapsedTime / timeNeeded;
    var currentPos = dist*percentCompleted + p2pos;
  }

  //report(['p2goal', 'p2pos']);
  //log('connectTime: '+connectTime.getTime());
  //log('p2posTime: '+p2posTime.getTime());
  //log('elapsedTime: '+elapsedTime);
  //log('dist: '+dist);
  //log('timeNeeded: '+timeNeeded);
  //log('percentCompleted: '+percentCompleted);
  //log('currentPos: '+currentPos);
  
  send(client.sessionId, {type:'movePaddle', which:'p2', pos:currentPos, goal:p2goal, init:true});



  // receive and parse messages from client
  client.on('message', function(msg){
    // to log all messages from clients:
    //var logmsg = 'msg: ';
    //for (i in msg) { logmsg += (i+':'+msg[i]+' '); }
    //log(logmsg);

    // receive and broadcast paddle data
    if (msg.type == 'movePaddle') {
      //log("movePaddle, which: "+msg.which+", goal: "+rnd(msg.goal));
      // send client's paddle position and goal to everybody except client
      io.broadcast({type: 'movePaddle', which:msg.which, pos:msg.pos, goal:msg.goal}, client.sessionId);
      //io.broadcast({type: 'movePaddle', which:msg.which, pos:msg.pos, goal:msg.goal});
      
      if (client.sessionId == player2.id) {
        if (p1heartBeat == false) {
          p1skippedBeat++;
          log('p1 SKIPPED: '+p1skippedBeat);
        } else {
          p1skippedBeat = 0;
          p1heartBeat = false;
        }
        
        p1pos = msg.pos;
        p1goal = msg.goal;
        p1posTime = new Date();
        
      }
      if (client.sessionId == player1.id) {
        if (p2heartBeat == false) {
          p2skippedBeat++;
          log('p2 SKIPPED: '+p2skippedBeat);
        } else {
          p2skippedBeat = 0;
          p2heartBeat = false;
        }

        p2pos = msg.pos;
        p2goal = msg.goal;
        p2posTime = new Date();

      }

      if (p1skippedBeat == flatline) {
        p1skippedBeat = 0; // reset
        log('p1 FLATLINE: '+player1.name);
        gameover('forfeit', player1);
        return false;
      }
      if (p2skippedBeat == flatline) {
        p2skippedBeat = 0; // reset
        log('p2 FLATLINE: '+player1.name);
        gameover('forfeit', player2);
        return false;
      }

    }

    if (msg.type == 'score') {
      if (!gameOn) {
        log('late score');
        return false;
      }
      if (!msg.me) {
        log(client.sessionID+' reports '+msg.which+' scored but is not playing');
        return false;
      }
      if (msg.which == 'p1' && p1scored == 0 && p2scored != 1 && p2returned != 1) {
        p1scored = 1;
        log(msg.me+': P1 SCORE');
        score1++;
        score();
      } else if (msg.which == 'p2' && p2scored == 0 && p1scored != 1 && p1returned != 1) {
        log(msg.me+': P2 SCORE');
        p2scored = 1;
        score2++;
        score();
      } else {
        log(msg.me+' reports '+msg.which+' scored, but:');
        log(' p1scored: '+p1scored+', p2scored: '+p2scored+', p1returned: '+p1returned+', p2returned: '+p2returned);
      }
    }

    if (msg.type == 'return') {
      log(' ');
      if (!gameOn) {
        log('late return');
        return false;
      }
      if (!msg.me) {
        log(client.sessionID+' reports '+msg.which+' returned but is not playing');
        return false;
      }
      if ( msg.which == 'p1' && p1returned == 0) {
        log(msg.which+' returned');
        p1returned = 1;
        p2returned = 0;
        endx = 97; // = 100 - 3% ball width
      } else if (msg.which == 'p2' && p2returned == 0) {
        log(msg.which+' returned');
        p2returned = 1;
        p1returned = 0;
        endx = 0;
      } else {
        //log('DOUBLE RETURN: '+msg.which+', p1returned: '+p1returned+', p2returned: '+p2returned);
        return false;
      }
      startx = msg.startx;
      starty = msg.starty;
      endy = msg.endy;
  
      //log(parseInt(client.sessionId/100000000000000)+": "+msg.which+" RETURN1");
      //log(' startx: '+rnd(startx)+', starty: '+rnd(starty)+', angle: '+rnd(msg.angle)+", p1returned: "+p1returned+", p2returned: "+p2returned);
  
      timeFactor *= .9; // increase speed with every volley (.9)
      timefactor = Math.max(timeFactor, .25) // speed limit = 4x
      duration = xTime * timeFactor;
      
      yTime = english(msg.angle);

      // adjust x duration to account for ytime: shorter ytime = longer xtime
      // yTime: 6000 = multiplier: 1.1
      if (yTime != 0) {
        var multiplier = 1+((21000 - Math.abs(yTime))/100000);
        duration = duration * multiplier;
        log('> yTime: '+yTime+', mult: '+multiplier+', duration: '+duration);
      }
      
      // speed up bounce to match volley speed
      yTime *= timeFactor;

      // adjust initial duration to account for current y position:
      // if halfway to goal, halve initial duration
      // check sign of yTime to find direction of ball, and determine
      // whether to use starty as proportion completed or proportion remaining
      inity = (yTime < 0 ? starty : 100 - starty);

      inityTime = Math.abs(yTime * inity/100);
      
      moveBall(duration, inityTime, yTime);
      //log('angle: '+rnd(msg.angle)+', xTime: '+rnd(xTime)+', yTime: '+rnd(yTime)+', inityTime: '+rnd(inityTime)+', duration: '+rnd(duration)+', timefactor: '+rnd(timeFactor));
      log('angle: '+rnd(msg.angle)+', yTime: '+rnd(yTime)+', duration: '+rnd(duration)+', timefactor: '+rnd(timeFactor));
    }

    // session sends name validation request
    if (msg.type == 'validate') {
      //log('validate');
      //log('queue length: '+queue.length);
      for (x in leaders) {
        //log('x: '+x);
        //log('leaders['+x+'].name: '+leaders[x].name);
        if (msg.name == leaders[x].name) {
          send(client.sessionId, {type:'validate', valid:false, alert:"NAME IN USE, TRY AGAIN"});
          return false;
        }
      }
      for (x in queue) {
        //log('x: '+x);
        //log('queue['+x+'].name: '+queue[x].name);
        if (msg.name == queue[x].name) {
          send(client.sessionId, {type:'validate', valid:false, alert:"NAME IN USE, TRY AGAIN"});
          return false;
        }
      }
      send(client.sessionId, {type:'validate', valid:true});
    }

    // session announces readiness to play
    if (msg.type == 'ready') {
      //log(' checking sessions, length: '+queue.length);
      //for (x in sessions) log('s '+sessions[x]);
      //for (x in queue) log('q '+queue[x].id);
      if (!hasAttr(queue, 'id', client.sessionId)) { // prevent double additions
      //if (!(contains(sessions, client.sessionId))) { // prevent double additions

        var idx = spectators.indexOf(hasAttr(spectators, 'id', client.sessionId));
        if (idx != -1) {
          //log(' spectator now playing');
          queue.push(spectators[idx]);
          spectators.splice(idx, 1);
        } else {

          // player object definition
          player = {id:client.sessionId, name:msg.name, wins:0, losses:0}

          // add player to waiting list
          queue.push(player);
        }

        send(client.sessionId, {type:'html', which:'position', html:queue.length});
        send(player.id, {type:'display', alert:'WELCOME '+player.name, delay:500});

        updateLeaderboard(client.sessionId);
        updatePlayerCounts();

      } else {
        //log(' session already seen');
        for (x in queue) {
          if (client.sessionId == queue[x].id) { // identify existing player
            player = queue[x];
            break;
          }
        }
      
      }
      
      log('> ready: '+msg.name+' '+client.sessionId)

      if (queue.length == 1) { // lonely player1...
        setTimeout(function() { // wait two seconds
          if (queue.length == 1) { // if still lonely, send a sad message
            send(client.sessionId, {type:'display', alert:'WAITING FOR CHALLENGER'})
          }
        }, 3000);
        var statusmsg = player.name + ' - AWAITING CHALLENGER';
        send(client.sessionId, {type:'html', which:'status', html:statusmsg});
        send(client.sessionId, {type:'css', which:'status', property:'background-color', value:'#666'});
        send(client.sessionId, {type:'css', which:'status', property:'color', value:'white'});
      } else if (queue.length == 2) {
        var statusmsg = player.name+ ' - READY';
        send(client.sessionId, {type:'html', which:'status', html:statusmsg});
        send(client.sessionId, {type:'css', which:'status', property:'background-color', value:'aqua'});
        send(client.sessionId, {type:'css', which:'status', property:'color', value:'fuchsia'});
      } else {
        updateQueuePositions();
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
            else {
              log('PROB NEWGAMEID STUCK');
              reset();
            }
          }, newgameDelay*3 );
      }
    }

    // move player from queue to spectators
    if (msg.type == 'spectating') {
      var statusmsg = ((msg.name) ? msg.name + ' - ' : '') + 'SPECTATING';
      send(client.sessionId, {type:'html', which:'status', html:statusmsg});
      send(client.sessionId, {type:'css', which:'status', property:'background-color', value:'#666'});
      send(client.sessionId, {type:'css', which:'status', property:'color', value:'white'});

      tapOut(client.sessionId);
    }

    // player received last message from server
    if (msg.type == 'heartBeat') {
      if (client.sessionId == player1.id) {
        //log('heartbeat: p1 '+player1.id);
        p1heartBeat = true;
      }
      else if (client.sessionId == player2.id) {
        //log('heartbeat: p2 '+player2.id);
        p2heartBeat = true;
      }
    }

    if (msg.type == 'log') {
      log(parseInt(client.sessionId/100000000000000)+': '+msg.what);
    }

  });

  client.on('disconnect', function(){
    log('\nDISCONNECT: '+client.sessionId);

    tapOut(client.sessionId);
    
    var idx = sessions.indexOf(client.sessionId);
    if (idx != -1) sessions.splice(idx, 1);
  });

});

function tapOut(sessionId) {
  // if playing, game over - player forfeits
  log("TAPOUT: sessionId: "+sessionId+", player1: "+player1.id+", player2: "+player2.id);
  if ((sessionId == player1.id || sessionId == player2.id)
      && gameOn) {
    which = sessionId == player1.id ? player1 : player2;
    gameover('forfeit', which);
  }

  // client loses place in line
  var idx = queue.indexOf(hasAttr(queue, 'id', sessionId));
  if (idx != -1) {
    log('> '+queue[idx].name+' leaving queue, becoming spectator');
    spectators.push(queue[idx]);
    queue.splice(idx, 1);
  }

  if (queue.length == 1) {
    playing = false;
    gameOn = false;
    var statusMsg = queue[0].name + ' - AWAITING CHALLENGER';
    log(statusMsg);
    send(queue[0].id, {type:'html', which:'status', html:statusMsg});
    send(queue[0].id, {type:'css', which:'status', property:'background-color', value:'#666'});
    send(queue[0].id, {type:'css', which:'status', property:'color', value:'white'});
  }

}

// move ball
function moveBall(xTime, inityTime, yTime) {
  //log('  moveBall: startx: '+rnd(startx)+', endx: '+rnd(endx)+', starty: '+rnd(starty)+', xTime: '+rnd(xTime)+', inityTime: '+rnd(inityTime)+', yTime: '+yTime);
  //io.broadcast({type:'moveBall', startx:startx, starty:starty, endx:endx, deltay:deltay, xTime:xTime, yTime:ytime});
  io.broadcast({type:'moveBall', startx:startx, endx:endx, starty:starty, xTime:xTime, inityTime:inityTime, yTime:yTime});
}


////////////////////////////////
//         GAME LOGIC

// start paddles off at midcourt
var p1pos = 50, p2pos = 50; // percents
var p1goal = 50, p2goal = 50;
var p1posTime = new Date(), p2posTime = new Date();

var connectTime = new Date();

var p1heartBeat = false, p2heartBeat = false;
var p1skippedBeat = 0, p2skippedBeat = 0;

var getSet = false, gameOn = false, playing = false, point = false;
var playLoopID = false, resetID = false, newgameID = false;

var score1 = 0, score2 = 0;
var p1scored = 0, p2scored = 0;
var p1returned = 0, p2returned = 0;

var delay = 50; // ms between updates (50)
var maxScore = 2;
var flatline = 50; // maximum allowable number of skipped heartBeats (25)
var resetDelay = 2000 // delay between volleys (2000)
var newgameDelay = 2000 // delay between games (2000)

var leaderboard = [];
var leaderboardHTML = '';
var leaders;

// flip a coin to see who serves
var endx = (Math.random() < .5 ? 0 : 97);
var endy = 50; // serve first ball straight across

var xTime = 4000; // first volley takes 2 seconds
timeFactor = 1; // duration multiplier

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

// get ordinal for number
function getOrdinal(number) {
  var ordinals = ["th","st","nd","rd"];
  var val = number%100;
  return number + (ordinals[(val-20)%10] || ordinals[val] || ordinals[0]);
}

// update "4th in line" display
function updateQueuePositions() {
  for (x in queue) {
    if (x != 0 && x != 1) { // don't update status of the current players
      if (x == 2) {
        var statusmsg = queue[x].name + ' - NEXT IN LINE!';
        send(queue[x].id, {type:'css', which:'status', property:'color', value:'fuchsia'});
        send(queue[x].id, {type:'css', which:'status', property:'background-color', value:'aqua'});
      } else {
        var y = parseInt(x)-1;
        log('updating queue['+x+']: '+queue[x]+': '+queue[x].name +': '+getOrdinal(y));
        var statusmsg = queue[x].name+ ' - '+getOrdinal(y) + ' IN LINE';
        send(queue[x].id, {type:'css', which:'status', property:'color', value:'white'});
        send(queue[x].id, {type:'css', which:'status', property:'background-color', value:'#666'});
      }
      send(queue[x].id, {type:'html', which:'status', html:statusmsg});
    }
  }
}

function updateLeaderboard(id) {
  // combine queue with leaderboard
  leaders = queue.slice(0); // make a copy of the queue
  
  // if board not empty, add old leaderboard to queue
  if (leaderboard.length != 0) leaders = leaders.concat(leaderboard);

  // sort by wins
  leaders.sort(function(a, b){
   return b.wins-a.wins; // i don't understand this
  })

  // remove duplicates
  leaders = eliminateDuplicates(leaders);

  leaders = leaders.slice(0,10); // trim to top 10
  leaderboard = leaders.slice(0); // copy array for storage

  // generate 10-entry leaderboard HTML and broadcast
  blanks = 10 - leaders.length; // how many blank lines?

  var scores = '';

  for (var x=0; x<leaders.length; x++) { // assemble leaderboard table
  
    // pick a class depending on whether they're still connected
    class = (contains(sessions, leaders[x].id)) ? '\'name\'' : '\'disconame\'';
    // build line
    scoreline = '<tr><td class=\'rank\'>'+String(parseInt(x)+1)+'.</td><td class='+class+'>'+leaders[x].name+'</td><td class=\'scor\'>'+leaders[x].wins+'</td></tr>\n'
    // add line to list
    scores += scoreline;
  }
  for (x=0;x<blanks;x++) {
    blank = '<tr><td class=\'rank\'>'+String(leaders.length+x+1)+'.</td><td class=\'name\'>...</td><td class=\'scor\'>...</td></tr>\n'
    scores += blank;
  }
  leaderboardHTML = scores;
  // this cuts down on new connection data spam
  // not sure it's the right solution, may not be necessary
  if (sessions.length > 10 && id) {
    send(id, {type:'html', which:'scoretable', html:leaderboardHTML});
  } else {
    io.broadcast({type:'html', which:'scoretable', html:leaderboardHTML});
  }
}

function updatePlayerCounts() {
  if (queue.length > 0) {
    var numString = queue.length + ' player' + (queue.length > 1 ? 's' : '') + ', ';
  } else {
    numString = 'no players, ';
  }

  var spectators = sessions.length - queue.length;
  if (spectators > 0) {
    numString += spectators + ' spectator' + (spectators > 1 ? 's' : '');
  } else {
    numString += 'no spectators';
  }
  io.broadcast({type:'html', which:'playerCounts', html:numString});
}


/////////////////////////////
//     HELPER FUNCTIONS

// round to nearest hundredth
function rnd(val) {
  return Math.round(val*100)/100;
}

// log shortcut
function log(x) {
  console.log(x);
}

// log a list of variables
function report(list) {
  msg = ''
  for (x in list) {
    msg += list[x]+': '+eval(list[x])+' | ';
  }
  log(msg);
}

// is a member of obj? approximate python's 'is in'
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

function eliminateDuplicates(array) {
  var newArray = new Array();

  label:for(var i=0; i<array.length; i++ ) {
    for(var j=0; j<newArray.length;j++ ) {
      if(newArray[j].name==array[i].name) continue label;
    }
    newArray[newArray.length] = array[i];
  }
  return newArray;
}


//////////////////////////////////
//           NEW GAME      

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
    send(player1.id, { type:'display', alert:'PLAYER 1 - GET READY<br>BEST OF 3'});
  } else { // player1 not connected, abort and reset
    var idx = queue.indexOf(player1);
    if (idx != -1) queue.splice(idx, 1);
    player1 = 0;
    newgame(0);
    return false;
  }
  if (contains(sessions, player2.id)) {
    send(player2.id, { type:'playing', paddle:'p2', delay:delay });
    send(player2.id, { type:'display', alert:'PLAYER 2 - GET READY<br>BEST OF 3'});
  } else { // player2 not connected, abort and reset
    var idx = queue.indexOf(player2);
    if (idx != -1) queue.splice(idx, 1);
    player2 = 0;
    newgame(0);
    return false;
  }

  io.broadcast({type:'gameon', player1:player1.name, player2:player2.name});
  var statusmsg = player1.name + ' - PLAYING';
  send(player1.id, {type:'html', which:'status', html:statusmsg});
  send(player1.id, {type:'css', which:'status', property:'background-color', value:'fuchsia'});
  send(player1.id, {type:'css', which:'status', property:'color', value:'aqua'});
  //send(player1.id, {type:'css', which:'p1', property:'background-color', value:'aqua'});
  
  var statusmsg = player2.name + ' - PLAYING';
  send(player2.id, {type:'html', which:'status', html:statusmsg});
  send(player2.id, {type:'css', which:'status', property:'background-color', value:'fuchsia'});
  send(player2.id, {type:'css', which:'status', property:'color', value:'aqua'});
  //send(player2.id, {type:'css', which:'p2', property:'background-color', value:'aqua'});

  updateQueuePositions();


  score1 = 0;
  score2 = 0;
  updateScores();

  if (!playing) {
    //log(' !PLAYING');

    getSet = true;
    if (!playLoopID) {
      log(' NO PLAYLOOP: starting');
      playLoopID = setTimeout(playLoop, delay, 'NEWGAME');
    } else log('PROB: playloop already going');

    // start gameplay
    if (resetID) {
      // kill any existing loop
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
  if (playing || getSet) {
    // old
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
  log('GAME OVER: '+type+', '+which.name);
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

    send(winner.id, {type:'css', which:'p1'});
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
    tapOut(loser.id);
    
    // tag losing player slot for reassignment
    if (loser == player1) player1 = 0; else player2 = 0;

    report(['sessions']);
    loggie = 'queue:';
    for (x in queue) loggie += ' '+queue[x].name;
    log(loggie);
  }

  if (queue.length > 1) {
    //log('queue.length: '+queue.length+': '+queue);
    if (!newgameID) newgameID = setTimeout(function() {newgame(1)}, newgameDelay );
    else log('PROB: already newgame');
  } else if (queue.length == 1){
    var statusMsg = queue[0].name + ' - AWAITING CHALLENGER';
    send(queue[0].id, {type:'html', which:'status', html:statusMsg});
    send(queue[0].id, {type:'css', which:'status', property:'background-color', value:'#666'});
    send(queue[0].id, {type:'css', which:'status', property:'color', value:'white'});
  }

  updatePlayerCounts();
  updateQueuePositions();
  updateLeaderboard();

}

function reset() {
  log('\nRESET: playing: '+playing+', gameOn: '+gameOn+', newgame: '+(newgame != false));
  //if (playing || !gameOn || !newgame) { 
  if ( (playing && !gameOn) || (playing && !newgame) ) {
    log('> false reset');
    return false;
  }
  if (queue.length < 2) {
    log('Awaiting another player...');
    return 0;
  }

  p1scored = 0;
  p2scored = 0;
  p1returned = 0;
  p2returned = 0;

  // determine who won coin toss/game/volley
  if (endx == 0) { // p2 is serving
    send(player1.id, {type:'collide', value:true});
    send(player2.id, {type:'collide', value:false});
  } else {          // p1 is serving
    send(player2.id, {type:'collide', value:true});
    send(player1.id, {type:'collide', value:false});
  }

  xTime = 4000;
  timeFactor = 1;
  
  deltay = 0;
  startx = 50, starty = 50;

  getset = false;
  playing = true;
  resetID = false;
  
  log("serving, p1returned: "+p1returned+", p2returned: "+p2returned);
  // send reset to players
  send(player1.id, {type:'reset'});
  send(player2.id, {type:'reset'});
  setcss('ball', 'visibility', 'visible');

  // serve ball half speed because it's starting from center court, halfway across
  // inityTime and yTime are both 0 = straight across
  moveBall(xTime/2, 0, 0);

  //log(' reset END');
}

// returns ball at an angle based on point of contact with paddle
function english(yval) {
  // convert from 0..11.5 range to 0..100
  // should really max out at 11 = 3% ball height + 8% paddle height
  //yval *= 8.7;

  if      (yval < 0)   speed = -3; // edge not as good as corner
  else if (yval < 5)  speed = -2; // corner better than edge
  else if (yval < 10)  speed = -4;
  else if (yval < 20)  speed = -6;
  else if (yval < 35)  speed = -8;
  else if (yval < 49)  speed = -10;
  else if (yval < 52)  speed = 0;
  else if (yval < 65)  speed = 10;
  else if (yval < 80)  speed = 8;
  else if (yval < 90)  speed = 6;
  else if (yval < 95)  speed = 4;
  else if (yval < 100) speed = 2;
  else speed = 3;

  var yfac = 1.0; //1.5; // angle extremeness tuner
  speed *= yfac;
  log(' english: '+rnd(yval)+' = '+speed*1000);

  return speed * 1000;
}

// END server.js