///////////////////////////
//      NETWORK CODE

// handshake and connect to the server through the transport
// of Socket.io's choice
var socket = new io.Socket(null, {port: 9980, rememberTransport: false});
socket.connect();

// this is triggered by the server's 'broadcast' and 'send' functions,
// it passes messages to the 'command' function.
socket.on('message', function(obj){
  if ('buffer' in obj){
    for (var i in obj.buffer) command(obj.buffer[i]);
  } else command(obj);
});


///////////////////////////
//      GAME CONTROL

// prepare for play
function ready() {
  $('#welcome').css('visibility','hidden');
  $('#insertcoin').css('display','none');

  // turn on mouse tracking
  $(document).mousemove(function(e){ mouseY = e.pageY; });

  // turn on touch tracking
  $('#toucharea').bind('touchstart touchmove', function(event) {
    var e = event.originalEvent;
    mouseY = e.touches[0].pageY;
    return false;
  });

  // send ready message to server
  // todo: check server to prevent existing names
  // todo: sanitize/encode inputs to prevent hanky and/or panky
  socket.send({type:'ready', name:$('#entername').val()});
}

// autogenerate a random 5-letter ID for testing
function makeid() {
  var txt = '';
  var consonants = 'BCDFGHJKLMNPQRSTVWXYZ';
  var vowels = 'AEIOUY';
  for (x=0;x<2;x++) {
    txt += consonants.charAt(Math.floor(Math.random() * consonants.length));
    txt += vowels.charAt(Math.floor(Math.random() * vowels.length));
  }
  txt += consonants.charAt(Math.floor(Math.random() * consonants.length));
  return txt;
}

// switch to play interface
function logIn() {
  $('#splash').css('display', 'none');
  $('#insertcoin').css('display', 'none');
  $('.hide').css('display', 'inline');
  $('#welcome').css('display', 'inline');
}

// no thanks, just browsing
function spectate() {
  $("#coin").animate({
    right: '0'
  }, 250, function() {
    $('#splash').css('display', 'none');
    $('#insertcoin').css('display', 'inline');
    $('#hide').css('display', 'inline');
    $('#welcome').css('display', 'none');

    socket.send({type:'watching'});
  });
}

function insertcoin() {
  $("#play").css('color', 'red');
  /*
  $("#coin").animate({
    right: '+=.25em'
  }, 100, 'linear', function() {
    $("#coin").animate({
      right: '2.1em'
    }, 250, 'linear', function() {
      setTimeout('logIn()', 500);
    });
  });
  */
  logIn();
}

// hide address bar on iPhone by scrolling down slightly
function scrollWindow() {
  /mobile/i.test(navigator.userAgent) && !location.hash && window.scrollTo(0, 1);
  //readout.html(String($(window).width()));
}


///////////////////////////
//     GAME VARIABLES

var playing = false; // are we sending mousemoves to the server?
                     // false == spectator
var colliding = false; // only players check for collisions
var returned = false;
var paddle = ''; // stores player name: p1 or p2
var deltax = 0, deltay = 0;
var mouseY = 0, lastY = 50, goal = 50;
var moveTimeout; // moveBall loop holder
var lastGoal; // compare current mouse position to last reported


// array of score-displaying divs
var scores = {
  0:[1,2,3,5,6,7],
  1:[3,6],
  2:[1,3,4,5,7],
  3:[1,3,4,6,7],
  4:[2,3,4,6],
  5:[1,2,4,6,7],
  6:[1,2,4,5,6,7],
  7:[1,3,6],
  8:[1,2,3,4,5,6,7],
  9:[1,2,3,4,6,7]
}

// jQuery shortcuts
var p1 = $('#p1'), p2 = $('#p2'), ball = $('#ball'), court = $('#court');
var readout = $('#readout');
var readout2 = $('#readout2');

var displayText;
var playTimer; // stores event loop timer


///////////////////////////
//      GAME LOGIC

// triggered by the server's 'broadcast' command
function command(msg){

  // respond to server with confirmation message
  socket.send({type:'heartBeat'});

  // should go through the server code and make sure these are all needed
  switch(msg.type) {
    case 'newgame':
      $('#player1').html(msg.player1);
      $('#player2').html(msg.player2);
      $('#playerhide').css('visibility', 'visible');
      break;

    case 'endgame':
      colliding = false;
      playing = false;
      paddle = '';
      ball.css('visibility', 'hidden');
      deltax = 0, deltay = 0;
      $('#playerhide').css('visibility', 'hidden');
      p1.css('background-color', 'gray');
      p2.css('background-color', 'gray');
      break;

    case 'display': // show a message
      clearTimeout(displayText); // if there's a timeout already, override
      $('#alert').html(msg.alert);
      $('#alert').css('visibility', 'visible');
      displayText = setTimeout( function() {
        $('#alert').css('visibility', 'hidden');
      }, 100);
      break;

    case 'css': // modify css of which
      $('#'+msg.which).css(msg.property, msg.value);
      break;

    case 'html': // change the html of 'which' div
      $('#'+msg.which).html(msg.html);
      break;

    case 'playing':
      if (msg.paddle == 'p1' || msg.paddle == 'p2') {
        playing = msg.paddle;
        paddle = $('#'+msg.paddle);
        paddle.css('background-color', 'white');
        ball.css('background-color', 'white');
        colliding = true;
        playLoop(msg.delay*1); // normally 1 - .8 seems to reduce lag?
      }
      break;

    case 'score': // update score
      score(msg.which, msg.val);
      returned = 0;
      break;
    
    case 'moveBall': // move ball
      ball.css({'visibility': 'visible', 'left': msg.startx+"%", 'top': msg.starty+"%"});
      deltax = msg.deltax;
      deltay = msg.deltay;
      if ( (deltax > 0 && playing == "p2") ||
      (deltax < 0 && playing == "p1") ) {
        returned = false; // prepare to return
      }
      moveBall();
      break;

    case 'movePaddle': // move paddle
      which = $("#"+msg.which);
      // cancel any existing jQuery animations
      which.stop(true);
      which.css('top', msg.pos+"%");

      // speed limit: 4% per step @ 20 fps
      duration = Math.abs(msg.goal - msg.pos)*12; // 12 comes from trial and error

      // use jQuery animation to move the paddle from its last reported
      // position to its last reported goal
      which.animate({top: msg.goal+'%'}, {"duration": duration, "easing": "linear"});
      //readout.html("goal: "+rnd(msg.goal)+", duration: "+rnd(duration));
      break;

    default: break;
  }
}

// main event loop
function playLoop(arg) {
  clearTimeout(playTimer)
  if (playing) {
    playTimer = setTimeout('playLoop('+arg+')', arg);
    //movePaddles();
    movePaddle();
  }
}

// send mouse position to the server
function movePaddle() {
  paddle = $("#"+playing);
  // get mouse position relative to court height as a %
  var possibleGoal = (mouseY - p1.height()/2 - court.offset().top) / court.height() * 100;
  // minimum movement: 1%
  goal = Math.abs(goal - possibleGoal) > 1 ? possibleGoal : goal;
  // keep paddle in court
  goal = Math.min ( Math.max(0, goal), 92);
  // speed limit: 4%
  if (goal-lastY < 0) {
    newY = Math.max(lastY-4, goal);
  } else if (goal-lastY > 0) {
    newY = Math.min(lastY+4, goal);
  }
  paddle.css('top', newY+"%");
  lastY = newY;

  //readout2.html("lastY-4: "+rnd(lastY-4)+", lastY+4: "+rnd(lastY+4)+", goal-lastY: "+rnd(goal-lastY));

  // update if mouse moved since last goal was sent
  if (lastGoal != goal) {
    socket.send({type:'movePaddle', which:playing, pos:lastY, goal:goal});
  }
  // store goal
  lastGoal = goal;
}

function moveBall() {
  // clear any existing moveBall loops
  clearTimeout(moveTimeout);
  newleft = parseFloat(ball.css('left')) + deltax;
  newtop = parseFloat(ball.css('top')) + deltay;

  //readout.html("x,y: "+rnd(parseFloat(ball.css("left")))+", "+rnd(parseFloat(ball.css("top")))+"<br>deltax: "+rnd(deltax)+", deltay: "+rnd(deltay)+"<br>newleft: "+rnd(newleft)+", newtop: "+rnd(newtop));

  // bounce off ceiling
  if (parseFloat(ball.css('top')) + deltay < 0) {
    clearTimeout(moveTimeout);
    ball.css('top', 0+"%");
    deltay = Math.abs(deltay); // downwards
  // bounce off floor
  } else if ( (parseFloat(ball.css('top')) + deltay) > 96 ) {
    clearTimeout(moveTimeout);
    ball.css('top', 96+"%");
    deltay = Math.abs(deltay)*-1; // upwards
  }

  // move ball
  ball.css({'left': newleft+"%", 'top': newtop+"%"});

  //readout2.html("left: "+rnd(ball.position().left)+", top: "+rnd(ball.position().top));

  if (colliding && !returned) {
    collisionDetection();
  }

  // P2 SCORED
  if (parseFloat(ball.css('left')) < 0) {
    ball.css('visibility', 'hidden');
    socket.send({type:'score', which:'p2'});

  // P1 SCORED
  } else if (parseFloat(ball.css('left')) > 97) { // 97% = 100% - 3% ball width
    ball.css('visibility', 'hidden');
    socket.send({type:'score', which:'p1'});

  // business as usual; loop the loop
  } else {
    moveTimeout = setTimeout("moveBall()", 50);
  }
}

// detect collisions between ball and paddle
function collisionDetection() {
  if (returned) { // already detected this volley
    return false;
  }
  ballx = parseFloat(ball.css('left')); // get percentage
  bally = ball.position().top;
  p1y = p1.position().top;
  p2y = p2.position().top;

  // collision zones: front edge of paddle to halfway off backside of paddle
  // prevents backedge returns, which feel cheaty
  // maybe just make it bounce off top and bottom edges?
  if (deltax < 0 && ballx >= 4.5 && ballx <= 7.5) {
    // ball on left side heading left; in p1's hitzone?
    if ( bally >= p1y - ball.height() && bally <= p1y + p1.height() ) {
      returned = 'p1';
      socket.send({what:"return", x:ballx, y:bally});
    }
  } else if (deltax > 0 && ballx >= 89 && ballx <= 90.5) { //
    // ball on right side heading right; in p2's hitzone?
    if (bally >= p2y - ball.height() && bally <= p2y + p2.height() ) {
      returned = 'p2';
      socket.send({what:"return", x:ballx, y:bally});
    } //else $('#readout').html('no collide right');
  }

  // a magnificent return
  if (returned) {
    // get relative y position so server can calculate english
    // todo: debug
    var angle = parseFloat(ball.css('top')) - parseFloat(paddle.css('top'));
    socket.send({type: 'return',
                 startx: ballx,
                 starty: bally/court.height()*100,
                 which: returned,
                 angle: angle});
  }
}

function score(which, val) {
  for (x in [1,2,3,4,5,6,7,8,9]) {
    element = '#'+which+' .s'+x;
    $(element).css('visibility', 'hidden');
  }
  for (x in scores[val]) {
    element = '#'+which+' .s'+scores[val][x];
    $(element).css('visibility', 'visible');
  }
}


/////////////////////////////
//     HELPER FUNCTIONS
function rnd(val) {
  return Math.round(val*100)/100;
}

function outAdd(string) {
  out = readout.html();
  out += string;
  readout.html(out);
}

// set animation speed: delay between updates in milliseconds
// equivalent to 20 frames per second
jQuery.fx.interval = 50;

// trigger when document has finished loading
$(document).ready(function() {
  scrollWindow();
  window.onorientationchange = scrollWindow;

  $('#entername').val(makeid());
  $('#entername').select();
  $('#entername').onfocus = '$(\'#entername\').value = \'\';';

  score('score1', 0);
  score('score2', 0);

  // click play and accept default name for fast testing
  insertcoin();
  ready();
});

// END CLIENT.JS