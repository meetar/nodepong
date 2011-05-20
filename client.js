///////////////////////////////////
// NodePong 0.1b client.js
// MIT License (C) P Richardson 2011
// some portions of this code MIT License (C) LearnBoost 2010
// some portions of this code MIT License (C) Joyent 2010


///////////////////////////
//      NETWORK CODE

// handshake and connect to the server through the transport of Socket.io's choice
var socket = new io.Socket(null, {port: 80, rememberTransport: false});
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

// ask server if desired ID is valid
function validateName() {
  name = $('#entername').val().toUpperCase();
  valid = ( /[^A-Za-z\d ]/.test(name)==false);
  if (name.length < 1) valid = false
  
  if (valid) socket.send({type:'validate', name:name});
  else {
    $('#entername').select();
    loginAlert("INVALID NAME, TRY AGAIN");
    return false;
  }
  
  validateTimeout = setTimeout( function() {
    loginAlert("SERVER TIMEOUT, TRY AGAIN");
  }, 20000);
  
}

function loginAlert(alertString) {
    $('#loginMessage').html(alertString);
    $('#entername').css('background-color', 'red');
    setTimeout( function() {
      $('#entername').css('background-color', 'white');
    }, 500);
}

// prepare for play
function play() {
  $('#login').css('display','none');
  $('#insertcoin').css('display','none');
  $('#spectate').css('visibility','visible');

  // send ready message to server
  socket.send({type:'ready', name:playerName});
}

// autogenerate a random 5-letter ID for testing
function makeID() {
  var txt = '';
  var consonants = 'BCDFGHJKLMNPQRSTVWXYZ';
  var vowels = 'AEIOUY';
  for (x=0;x<2;x++) {
    txt += consonants.charAt(Math.floor(Math.random() * consonants.length));
    txt += vowels.charAt(Math.floor(Math.random() * vowels.length));
  }
  txt += consonants.charAt(Math.floor(Math.random() * consonants.length));
  $('#entername').val(txt);
  $('#entername').select();
  $('#entername').onfocus = '$(\'#entername\').value = \'\';';

}

// no thanks, just browsing
function spectate() {
  $('#insertcoin').css('display', 'inline');
  $('#insertcoin').css('visibility', 'visible');
  $('#spectate').css('display', 'none');
  $('#spectate').css('visibility', 'hidden');
  $('#login').css('display', 'none');
  //$('#alert').css('display', 'none');
  socket.send({type:'spectating', name:playerName});
}

// switch to play interface
function insertcoin() {
  if (!playerName) {
    $('#loginMessage').html("WHAT YOUR PONG NAME");

    $('#insertcoin').css('display', 'none');
    $('#spectate').css('display', 'inline');
    $('#spectate').css('visibility', 'hidden');
    $('#status').css('display', 'block');

    makeID();

    $("#play").css('color', 'red');

    $('#login').css('display', 'inline');
  } else {
    $('#spectate').css('display', 'inline');
    $('#spectate').css('visibility', 'visible');
    play();
  }
}

// hide address bar on iPhone by scrolling down slightly
function scrollWindow() {
  /mobile/i.test(navigator.userAgent) && !location.hash && window.scrollTo(0, 1);
  //if (testMode) readout.html(String($(window).width()));
}


///////////////////////////
//     GAME VARIABLES

var playerName = '';
var playing = false; // are we sending mousemoves to the server?
                     // false == spectator
var colliding = false; // only players check for collisions
var returned = false, scored = false;
var paddle = ''; // stores player name: p1 or p2
var deltax = 0; //, deltay = 0;
var mouseY = 50, lastY = 50, newY = 50, goal = 50;
var lastbx = 50, lastby = 50; // ball positions, for collision detection
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
};

// jQuery shortcuts
var p1 = $('#p1'), p2 = $('#p2'), xball = $('#xball'), ball = $('#ball'), court = $('#court'), body = $('body');
var readout = $('#readout');
var readout2 = $('#readout2');

var playTimer; // stores event loop timer
var displayText;
var validateTimeout;
var testMode = false;

///////////////////////////
//      GAME LOGIC

// triggered by the server's 'broadcast' command
function command(msg){

  // respond to server with confirmation message
  if (playing) socket.send({type:'heartBeat'});

  // should go through the server code and make sure these are all needed
  switch(msg.type) {
    
    // receives server's ID validation
    case 'validate':
      clearTimeout(validateTimeout);
      if (msg.valid) {
        playerName = $('#entername').val().toUpperCase();
        play();
      }
      else {
        loginAlert(msg.alert);
        if (msg.suggested) $('#entername').val(msg.suggested);
      }
      
      break;

    // set player names and show players
    case 'gameon':
      $('#player1').html(msg.player1);
      $('#player2').html(msg.player2);
      $('#playerhide').css('visibility', 'visible');
      break;

    case 'playing':
      socket.send({type:"log", what:"PLAYING"});
      if (msg.paddle == 'p1' || msg.paddle == 'p2') {
        if (testMode) readout.html('playing: '+msg.paddle);
        // make sure to kill any previous game
        ball.css('visibility', 'hidden');
        xball.stop(true);
        ball.stop(true);
        xball.css('left',court.width()/2+"px")
        ball.css('top',court.height()/2+"px")
        
        // turn on mouse tracking
        $(document).mousemove(function(e){ mouseY = e.pageY; });

        // turn on touch tracking
        $('#toucharea').bind('touchstart touchmove', function(event) {
          var e = event.originalEvent;
          mouseY = e.touches[0].pageY;
          return false;
        });


        playing = msg.paddle;
        paddle = $('#'+msg.paddle);
        paddle.css('background-color', 'white');
        ball.css('background-color', 'white');
        colliding = true;

        paddle.css('top', '50%');
        //paddle.css('background-color', 'blue');
        socket.send({type:'movePaddle', which:playing, pos:lastY, goal:lastY});
        playLoop(msg.delay); // normally 1 - .8 seems to reduce lag?
      }
      break;

    case 'display': // show a message
      clearTimeout(displayText); // if there's a timeout already, override
      delay = (msg.delay ? msg.delay : 0);
      setTimeout( function() {
        $('#alert').html(msg.alert);
        $('#alert').css('visibility', 'visible');
        displayText = setTimeout( function() {
          $('#alert').css('visibility', 'hidden');
        }, 2000);
      }, delay);
      break;

    case 'css': // modify css of which
      $('#'+msg.which).css(msg.property, msg.value);
      break;

    case 'html': // change the html of 'which' div
      $('#'+msg.which).html(msg.html);
      break;

    case 'score': // update score
      score(msg.which, msg.val);
      break;
    
    case 'reset': // prepare for new volley
      returned = 0;
      scored = 0;
      break;
    
    case 'moveBall': // move ball
      if (!playing) {
        //socket.send({type:"log", what:"MOVEBALL: BAIL"});
        return false;
      }
      socket.send({type:"log", what:"MOVEBALL"});
      // kill any existing or queued animates()
      xball.stop(true);
      ball.stop(true);
      if (testMode) {
        readout.html("");
        readout.html('moveBall: '+rnd(msg.startx)+", "+rnd(msg.starty)+
        '<br>end: '+rnd(msg.endx)+', xTime: '+rnd(msg.xTime));
      }
      //testing
      //xball.css({'left': msg.startx+"%"});
      startxpx = msg.startx/100*court.width();
      xball.css({'left': startxpx+"px"});
      //testing
      //ball.css({'visibility': 'visible', 'top': msg.starty+"%"});
      startypx = msg.starty/100*court.height();
      ball.css({'visibility': 'visible', 'top': startypx+"px"});
      ball.css({'background-color': 'white'});

      deltax = msg.endx == 0 ? -1 : 1; // set direction
      //deltay = msg.deltay * court.height() / 100; // convert to %
      lastbx = msg.startx; // reset client's last ball position to startx
      returned = false;
      
      //readout2.html("");
      
      /////////////////////////
      // animate xball on the X
      //testing
      //xball.animate({left: msg.endx+"%"}, {duration: msg.xTime, easing: 'linear',
      endxpx = msg.endx/100*court.width();
      xball.animate({left: endxpx+"px"}, {duration: msg.xTime, easing: 'linear',
      
      step: function() {
        //readout2.html("left: "+rnd(xball.position().left)+", top: "+rnd(xball.position().top));

        if (colliding && !returned) {
          collisionDetection();
        }

        //if (testMode) readout.html("xball.position().left: "+rnd(xball.position().left)+", court.width()*.97: "+ rnd(court.width()*.97));

      }, complete: function () {
        // if ball gets to its goal
        
        //if (testMode) readout2.html("complete: returned: "+returned+", scored: "+scored);
        
        if (msg.endx == 0) {
          if (!returned && !scored) {
          // P2 SCORED
            scored = true;
            
            socket.send({type:'score', me:playing, which:'p2'});
            //if (testMode) readout2.html("complete at 0: returned: "+returned+", scored: "+scored);
          }

        } else if (msg.endx == 97) {
          if (!returned && !scored) {
          // P1 SCORED
            scored = true;
            
            socket.send({type:'score', me:playing, which:'p1'});
            //if (testMode) readout2.html("complete at 97: returned: "+returned+", scored: "+scored);
          }
        }

      }});
      
      /////////////////////////
      // animate ball on the Y
    
      if (msg.yTime != 0) { // only if there's a ytime, otherwise it goes straight across
        endy = (msg.yTime < 0 ? 0 : 96);
        //if (testMode) readout.html('endy: '+endy+', inityTime: '+rnd(msg.inityTime)+', yTime: '+msg.yTime);
        nextTime = msg.yTime * -1;

        //testing
        //ball.animate({"top": endy+'%'}, {duration: msg.inityTime, easing: 'linear',
        endy = endy/100*court.height();
        ball.animate({"top": endy+'px'}, {duration: msg.inityTime, easing: 'linear',
          complete: function() {
            bounceY(nextTime);
          }
        });
      }

      if ( (deltax > 0 && playing == "p2") || 
           (deltax < 0 && playing == "p1") ) {
        returned = false; // prepare to return
      }

      break;

    case 'movePaddle': // move paddle
      //if (testMode) readout.html('which: '+msg.which+', pos: '+rnd(msg.pos)+', goal: '+rnd(msg.goal));
    
      which = $("#"+msg.which);
      // cancel any existing jQuery animations
      which.stop(true);
      
      if (msg.init) {
        which.css('top', msg.pos+'%');
      }
      
      pos = which.position().top/court.height()*100;
      
      // speed limit: 4% per step @ 20 fps
      //duration = Math.abs(msg.goal - msg.pos)*12; // 12 comes from trial and error
      duration = Math.abs(msg.goal - pos)*10; // 10 comes from trial and error

      // use jQuery animation to move the paddle from its last reported
      // position to its last reported goal
      //if (testMode) which.animate({top: msg.goal+'%'}, {"duration": duration, "easing": "linear", step: function () { which.html(":"+rnd(msg.goal)+","+rnd(pos)); }
      which.animate({top: msg.goal+'%'}, {"duration": duration, "easing": "linear"});
      break;
      
    case 'endgame':
      socket.send({type:"log", what:"ENDGAME"});
      if (testMode) readout2.html("FORFEIT");
      colliding = false;
      playing = false;
      paddle = '';
      xball.stop(true);
      ball.stop(true);
      ball.css('visibility', 'hidden');
      xball.css('left',court.width()/2+"px")
      ball.css('top',court.height()/2+"px")
        
      
      // turn off mouse tracking
      $(document).mousemove(null);

      // turn off touch tracking
      $('#toucharea').unbind('touchstart touchmove');

      deltax = 0; //, deltay = 0;
      $('#playerhide').css('visibility', 'hidden');
      p1.css('background-color', 'gray');
      p2.css('background-color', 'gray');
      break;

    default: break;
  }
}

// bounce ball off of floor and ceiling
function bounceY(time) {
  var top;
  var thisTime, nextTime;
  //ball.stop(true, true); // ie has problems with this
  thisTime = Math.abs(time); // positive animate() durations only
  nextTime = time * -1; // when done, head the other way

  top = (time < 0 ? 0 : 96); // negative time = heading up, positive = down 

  //if (testMode) $("#returned").html('bounce, top: '+top+', time: '+time+', next: '+nextTime+', this: '+thisTime);  
  //if (testMode) readout2.html('top!: '+top+', thistime: '+thisTime);

  //testing
  //ball.animate({top: top+"%"},{duration: thisTime, easing: "linear", complete: function() {bounceY(nextTime);}});
  topx = top/100*court.height();
  ball.animate(
    {top: topx+"px"},
    {duration: thisTime, easing: "linear", complete: function() {bounceY(nextTime);}}
  );
  
}
        
// main event loop
function playLoop(arg) {
  clearTimeout(playTimer)
  if (playing) {
    playTimer = setTimeout('playLoop('+arg+')', arg);
    movePaddle();
  }
  //if (testMode) $("#returned").html(xball.position().left+','+ball.position().top+'<br>'+ball.css('visibility'));

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
  // speed limit: 5%
  if (goal-lastY < 0) {
    newY = Math.max(lastY-5, goal);
  } else if (goal-lastY > 0) {
    newY = Math.min(lastY+5, goal);
  }
  paddle.css('top', newY+"%");
  //if (testMode) paddle.html(rnd(goal)+","+rnd(newY));
  lastY = newY;

  //if (testMode) readout2.html("lastY-4: "+rnd(lastY-4)+", lastY+4: "+rnd(lastY+4)+", goal-lastY: "+rnd(goal-lastY));

  // update if mouse moved since last goal was sent
  if (lastGoal != goal) {
    socket.send({type:'movePaddle', which:playing, pos:lastY, goal:goal});
  }
  // store goal
  lastGoal = goal;
}

// detect collisions between ball and paddle
function collisionDetection() {
  if (returned) { // already detected this volley
    //if (testMode) readout2.html("already returned: "+returned+", returning false");
    return false;
  }
  ballx = xball.position().left / court.width() * 100; // get percentage
  bally = ball.position().top;
  p1y = p1.position().top;
  p2y = p2.position().top;

  // collision zones: front edge of paddle to halfway off backside of paddle
  // prevents backedge returns, which feel cheaty
  // maybe just make it bounce off top and bottom edges?

  // new swept-volume collision detection
  topmost = lastby < bally ? lastby : bally;
  topmost += ball.height(); // highest point reached by bottom of ball
  bottommost = lastby > bally ? lastby : bally; // lowest point reached by top of ball

  if (deltax < 0 && ballx <= 7.5 && lastbx >= 4.5) {
    // ball on left side heading left; in p1's hitzone?
    if ( topmost >= p1y && bottommost <= p1y + p1.height() ) {
      returned = 'p1';
      deltax = 1;
    }
  } else if (deltax > 0 && ballx >= 89 && lastbx <= 92) {
    // ball on right side heading right; in p2's hitzone?
    if ( topmost >= p2y && bottommost <= p2y + p2.height() ) {
      returned = 'p2';
      deltax = -1;
    }
  }
  
  // a magnificent return!
  if (returned) {
    xball.stop();
    
    // get relative y position so server can calculate english
    // get position of ball as a proportion of paddle's height
    var which = (returned == 'p1' ? p1 : p2);
    var angle = ((ball.position().top + ball.height()/2 - which.position().top)/paddle.height())*100;

    //if (readout) $("#returned").html('ball.position().top: '+ball.position().top+'<br>ball.height()/2: '+ball.height()/2+    '<br>ball.position().top + ball.height(): '+(ball.position().top + ball.height()/2)+'<br>which.position().top: '+which.position().top+'<br>relative px: '+(ball.position().top + ball.height()/2 - which.position().top)+'<br>which.height(): '+which.height()+'<br>angle: '+rnd(angle));

    socket.send({type: 'return',
                 me: playing,
                 startx: ballx,
                 starty: bally/court.height()*100,
                 which: returned,
                 angle: angle});
    if (testMode) readout2.html(playing+" returned! "+returned+", angle: "+rnd(angle));
  }

  lastbx = ballx;
  lastby = bally;
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

function setBodyScale() {
 
  var scaleSource = court.width(),
    scaleFactor = 0.35,                     
    maxScale = 200,
    minScale = 100; //Tweak these values to taste

  var fontSize = scaleSource * scaleFactor; // Multiply the width of the body by the scaling factor:

  if (fontSize > maxScale) fontSize = maxScale;
  if (fontSize < minScale) fontSize = minScale; // Enforce the minimum and maximums

  body.css('font-size', fontSize + '%');
}

// trigger when document has finished loading
$(document).ready(function() {
  $('#insertcoin').css('visibility', 'hidden');
  $('#spectate').css('visibility', 'hidden');
  scrollWindow();
  window.onorientationchange = scrollWindow;

  //$('#playerhide').css('visibility', 'hidden');

  makeID();

  score('score1', 0);
  score('score2', 0);

  // click play and accept default name for fast testing
  //validateName();

  $(window).resize(function(){
    setBodyScale();
  });

  //Fire it when the page first loads:
  setBodyScale();
  
});

// END client.js