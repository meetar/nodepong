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
    doctype = doctype[doctype.length-1];

    res.writeHead(200, {'Content-Type': doctype == 'html' ? 'text/html' : 'text/javascript'})
    res.write(data, 'utf8');
    res.end();
  });
}),

send404 = function(res){
  res.writeHead(404);
  res.write('404');
  res.end();
};

server.listen(9980);

// socket.io, I choose you
var io = io.listen(server);

sessions = []; // list of all sessions
queue = []; // player queue
var player1 = 0, player2 = 0; // current players

// tidier helper app with session checking to prevent send errors
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

// ***** CLIENT CONNECT ***** //

io.on('connection', function(client){
  if (!contains(sessions, client.sessionId)) {
    sessions.push(client.sessionId);
    log('\nCONNECT: '+client.sessionId);
  }

  client.on('message', function(msg){
    // for logging all messages
    //var logmsg = 'msg: ';
    //for (i in msg) { logmsg += (i+":"+msg[i]+" "); }
    //log(logmsg);

    if (msg.type == 'move') {
      if (msg.which == "p1") {
        p1pos = msg.y;
      } else if (msg.which == "p2") {
        p2pos = msg.y;
      }
    }

    if (msg.type == 'ready') {
      if (!hasAttr(queue, "id", client.sessionId)) {
        log('ready: '+msg.name+" "+client.sessionId)

        // player object definition
        player = {id:client.sessionId, name:msg.name, wins:0, losses:0}

        // populate leaderboard
        //log("populating queue, size: "+Object.size(queue));
        for (x in queue) {
          //log("queue["+x+"]: "+queue[x].name);
          p = queue[x];
          send(client.sessionId, {type:"board", mode:"add", name:p.name, wins:p.wins, losses:p.losses});
        }

        queue.push(player);
        send(client.sessionId, {type:'html', html:player.name});
        //log('queue.length:'+queue.length);
        send(client.sessionId, {type:'position', position:queue.length});
        send(client.sessionId, {type:'display', alert:"WELCOME "+player.name});
        // broadcast self to all
        io.broadcast({type:"board", mode:"add", name:player.name, wins:player.wins, losses:player.losses});
      }

      if (queue.length == 1) {
        newgameID = setTimeout(function() {send(client.sessionId, {type:"display", alert:"WAITING FOR CHALLENGER"})}, 2000);
      }

      //report(['gameOn', 'playing', 'resetID']);
      //log("queue length: "+Object.size(queue));
      if (Object.size(queue) > 1 && !gameOn && !newgameID) {
        log(' connect NEWGAME');
        newgameID = setTimeout(function() {newgame(2)}, newgameDelay );
      }

      if (gameOn) {
        send(client.sessionId, {type:'css', which:'p1', property:'visibility', value:'visible'});
        send(client.sessionId, {type:'css', which:'p2', property:'visibility', value:'visible'});
        if (playing) {
          send(client.sessionId, {type:'css', which:'ball', property:'visibility', value:'visible'});
        }
      }
    }

    if (msg.type == 'return') {
      if (!playing) {
        log(' false return: not playing');
        return 0; // sometimes return is sent after score:
      }
      if (Math.abs(ballx - courtWidth*.5) < 100) {
        log(' false return: ball not at edge');
        return 0;
      }

      if (msg.which == "p1") { // tell p2 to detect collisions
        deltax = Math.abs(deltax);
        send(player1.id, {type:'collide', value:false});
        send(player2.id, {type:'collide', value:true});
      } else { // tell p1 to detect collisions
        deltax = Math.abs(deltax) * -1;
        send(player1.id, {type:'collide', value:true});
        send(player2.id, {type:'collide', value:false});
      }

      var increase = 1.1; // normally 1.1
      var maxSpeed = 100; // normally 100
      if (deltax > 1) {
        deltax = Math.min(deltax * increase, maxSpeed);
      }
      else {
        deltax = Math.max(deltax * increase, -1 * maxSpeed);
      }

      deltay = msg.english;
    }

    if (msg.type == 'heartBeat') {
      //log("heartbeat:"+client.sessionId+", p1.id:"+player1.id+", p2.id:"+player2.id);
      if (client.sessionId == player1.id) p1heartBeat = true;
      else if (client.sessionId == player2.id) p2heartBeat = true;
    }
  });

  client.on('disconnect', function(){
    log("\nDISCONNECT: "+client.sessionId);

    // if playing, game over - disconnecter forfeits
    if ((client.sessionId == player1 || client.sessionId == player2)
        && gameOn) {
      gameover('forfeit', client.sessionId);
    }
    // client loses place in line
    var idx = queue.indexOf(hasAttr(queue, "id", client.sessionId));
    if (idx != -1) {
      queue.splice(idx, 1);
      io.broadcast({type:"board", mode:"remove", remove:idx});
    }
    var idx = sessions.indexOf(client.sessionId);
    if (idx != -1) sessions.splice(idx, 1);

    //log('  sessions: '+sessions);
  });
});


function contains(a, obj) {
  var i = a.length;
  while (i--) { if (a[i] == obj) return true; }
  return false;
}

// does obj contain a key with value val? if so return key
function hasAttr(obj, id, val) {
 for(x in obj) {
  for (y in obj[x]) {
   //alert("x:"+x+", obj[x]:"+obj[x]+", y:"+y+", obj[x][y]:"+obj[x][y]);
   if (y == id && obj[x][y] == val) {return obj[x];}
  }
 }
 return false;
}

//**** GAME LOGIC ****//

var courtWidth = 640, courtHeight = 480;
io.broadcast({type:'size', which:'court', width:courtWidth, height:courtHeight});

var paddleHeight = 40, paddleWidth = 20, ballSize = 10;
var p1pos = courtHeight/2, p2pos = courtHeight/2;
io.broadcast({type:'size', which:'p1', height:paddleHeight, width:paddleWidth});
io.broadcast({type:'size', which:'p2', height:paddleHeight, width:paddleWidth});
io.broadcast({type:'size', which:'ball', height:ballSize, width:ballSize});

var courtleft = 0, courttop = 0;
var minx = courtleft;
var miny = courttop;
io.broadcast({type:'move', which:'court', y:courttop, x:courtleft});
var maxx = courtWidth-(ballSize*2);
var maxy = courtHeight-(ballSize*2);

var p1heartBeat = false, p2heartBeat = false;
var p1skippedBeat = 0, p2skippedBeat = 0;

var getSet = false, gameOn = false, playing = false, point = false;
var playLoopID = false, resetID = false, newgameID = false;

var volleys = 0;
var score1 = 0, score2 = 0;
var justScored = "";

// game settings
var delay = 50; // ms between updates
var startSpeed = 10;
var maxScore = 2;
var flatline = 25; // maximum allowable number of skipped heartBeats
var resetDelay = 2000 // delay between volleys - normal: 1000
var newgameDelay = 2000 // delay between games - normal: 2000

// flip a coin to see who serves
var deltax = (Math.random() < .5 ? -1 * startSpeed : startSpeed) * delay/5;
var deltay = 0;
var ballx = 0, bally = 0;

updateScores();

function score() {
  //log('score');
  point = true;
  playing = false;

  //log("score! p1: "+score1+", p2: "+score2);
  updateScores();
}

function updateScores() {
  io.broadcast({type:'score', which:'score1', val:score1});
  io.broadcast({type:'score', which:'score2', val:score2});
}

function log(x) {
  console.log(x);
}

function report(list) {
  msg = ''
  for (x in list) {
    msg += list[x]+': '+eval(list[x])+' | ';
  }
}


// ***** NEW GAME ***** //

function newgame(id) {
  log('\n*NEWGAME* '+id);
  if (sessions.length < 2 || Object.size(queue) < 2) {
    log(' false start- sessions.length:'+sessions.length+", Object.size(queue):"+Object.size(queue));
    return false;
  }
  //log('current players: p1:'+player1+', p2:'+player2);
  // assign unassigned players to unassigned player slots
  if (player1 == 0) { // for slot 1
    //log(10);
    if (queue[0] != player1 && queue[0] != player2) {
      //log(11);
      player1 = queue[0];
    } else if (queue[1] != player1 && queue[1] != player2) {
      //log(12);
      player1 = queue[1];
    }
  }
  if (player2 == 0) { // same for slot 2
    //log(20);
    if (queue[0] != player1 && queue[0] != player2) {
      player2 = queue[0];
      //log(21);
    } else if (queue[1] != player1 && queue[1] != player2) {
      player2 = queue[1];
      //log(22);
    }
  }

  log(" PLAYERS: p1: "+player1.name+", p2: "+player2.name);
  //justScored = "";

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

  io.broadcast({type:"newgame"});

  volleys = 0;
  score1 = 0;
  score2 = 0;
  // update scores
  updateScores();

  // start paddles
  if (!playing) {
    getSet = true;
    if (!playLoopID) {
      //log(' newgame PLAYLOOP');
      playLoopID = setTimeout(playLoop, delay, 'NEWGAME');
    } else log('PROB: playloop already going');

    // start gameplay
    if (resetID) {
      clearTimeout(resetID);
    }
    resetID = setTimeout( reset, resetDelay );
    //log(' newgame RESET');

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
  //log("css: "+which+"."+property+":"+value);
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
    log("player 1 FLATLINE");
    gameover('forfeit', player1);
    return false;
  }
  if (p2skippedBeat == flatline) {
    log("player 2 FLATLINE");
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

  report(["gameOn", "getSet", "playing"]);
  playLoopID = false;
}

// GAME OVER
// type:"win"|"forfeit", player:[object Object]
function gameover(type, which) {
  //log("GAME OVER: "+type+", "+which.name);
  gameOn = false;
  playing = false;
  newgameID = false;

  io.broadcast({type:"endgame"});

  // WIN
  if (type == 'win') {
    winner = which;
    loser = (which == player1) ? player2 : player1;
    log(winner.name + " WINS");
    send(winner.id, {type:'display', alert:"YOU WIN"});
    send(loser.id, {type:'display', alert:"YOU LOSE"});
    // broadcast to everybody except [winner, loser]
    io.broadcast({type:'display', alert:winner.name+" WINS", id:0}, [winner.id, loser.id]);

    // increment wins/losses
    winner.wins++;
    loser.losses++;

    // move loser to end of queue line
    var idx = queue.indexOf(loser);
    //log("loser idx:"+idx);
    if (idx != -1) {
      //log('sending board idx: '+idx);
      //"" makes this to string - passing as toString(idx) = [object Object]... why?
      io.broadcast({type:"board", mode:"remove", remove:""+idx+""});
      io.broadcast({type:"board", mode:"add", name:loser.name, wins:loser.wins, losses:loser.losses});
      queue.splice(idx,1);
      queue.push(loser);
      var qmsg = "";
      for (x in queue) qmsg += " "+queue[x].name;
      //log(Object.size(queue)+" in queue:"+qmsg);
    }

    // update winner's wins
    io.broadcast({type:"board", mode:"win", name:winner.name, wins:winner.wins, losses:winner.losses}); // will increment wins figure in slot 1

    // tag losing player slot for reassignment
    if (loser == player1) player1 = 0; else player2 = 0;

  // FORFEIT
  } else if (type == 'forfeit') {
    loser = which;
    winner = (which == player1) ? player2 : player1;

    log("FORFEIT: "+loser.id + ": "+loser.name);
    io.broadcast({type:'display', alert:loser.name+" FORFEITS"});

    winner.wins ++;

    // remove loser from queue and sessions
    var idx = queue.indexOf(loser);
    if (idx != -1) {
      log('removing from queue');
      queue.splice(idx,1);
      io.broadcast({type:"board", mode:"remove", remove:idx});
    } else {log("not in queue - can't remove");}
    var idx = sessions.indexOf(loser.id);
    if (idx != -1) sessions.splice(idx, 1);

    // tag losing player slot for reassignment
    if (loser == player1) player1 = 0; else player2 = 0;

    report(["sessions", "queue"]);
  }

  if (Object.size(queue) > 1) {
    //log('Object.size(queue): '+Object.size(queue)+": "+queue);
    if (!newgameID) newgameID = setTimeout(function() {newgame(1)}, newgameDelay );
    else log('PROB: already newgame');
  }
}

function reset() {
  //log("\n*RESET* ");
  if (playing || !gameOn || !newgame) {
    log(" false reset: playing: "+playing+", gameOn: "+gameOn);
    return false;
  }
  if (Object.size(queue) < 2) {
    log("Awaiting another player...");
    return 0;
  }

  // determine who won coin toss/game/volley
  if (justScored == "p1") deltax = Math.abs(deltax);
  if (justScored == "p2") deltax = Math.abs(deltax) * -1;

  if (deltax < 0) { // p2 is serving
    send(player1.id, {type:'collide', value:true});
    send(player2.id, {type:'collide', value:false});
  } else {          // p1 is serving
    send(player2.id, {type:'collide', value:true});
    send(player1.id, {type:'collide', value:false});
  }

  deltax /= Math.abs(deltax); // set to 1 while keeping sign
  deltax *= delay/5; // keep same velocity, accounting for delay
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

  // var to enable scoring - useful for testing touch
  var scoringOn = true;

  if (ballx == maxx && scoringOn) { // P1 point
    justScored = "p1";
    score1 ++;
    score();
  } else if (ballx == minx && scoringOn ) { // P2 point
    justScored = "p2";
    score2 ++;
    score();
  }
}