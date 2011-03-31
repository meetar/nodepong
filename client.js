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

function scrollWindow() {
  /mobile/i.test(navigator.userAgent) && !location.hash && window.scrollTo(0, 1);
}

$(document).ready(function() {
  //scrollWindow();
  window.onorientationchange = scrollWindow;

  $('#entername').val(makeid());
  $('#entername').select();
  $('#entername').onfocus = '$(\'#entername\').value = \'\';';


  //ready();

  $('.typekit-badge').css('display', 'none');

});

var playing = false; // are we sending mousemoves to the server?
var colliding = false;
var paddle = '';
var lastBallX = 0, lastBallY = 0;
var lastPaddleY = 0;
var deltax = 0, deltay = 0;

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

score('score1', 0);
score('score2', 0);

var p1 = $('#p1'), p2 = $('#p2'), ball = $('#ball'), court = $('#court');
var displayText;
var flashDelay = 1300;

// this command is triggered by the server's 'broadcast'
function command(msg){

  switch(msg.type) {
    case 'newgame':
      $('#player1').html(msg.player1);
      $('#player2').html(msg.player2);
      p1.css('visibility', 'visible');
      p2.css('visibility', 'visible');
      centerline.css('visibility', 'visible');
      break;
    case 'endgame':
      colliding = false;
      playing = false;
      paddle = '';
      ball.css('visibility', 'hidden');
      centerline.css('visibility', 'hidden');
      p1.css('background-color', 'gray');
      p2.css('background-color', 'gray');
      p1.css('visibility', 'hidden');
      p2.css('visibility', 'hidden');
      break;
    case 'display':
      clearTimeout(displayText); // if there's a timeout already, override
      $('#alert').html(msg.alert);
      $('#alert').css('opacity', 1);
      setTimeout( function() {$('#alert').css('opacity', 0)}, flashDelay);
      setTimeout( function() {$('#alert').css('opacity', 1)}, flashDelay+50);
      setTimeout( function() {$('#alert').css('opacity', 0)}, flashDelay+100);
      setTimeout( function() {$('#alert').css('opacity', 1)}, flashDelay+150);
      setTimeout( function() {$('#alert').css('opacity', 0)}, flashDelay+200);
      setTimeout( function() {$('#alert').css('opacity', 1)}, flashDelay+250);
      setTimeout( function() {$('#alert').css('opacity', 0)}, flashDelay+300);
      //displayText = setTimeout( function() {
      //  $('#alert').animate({opacity: 0}, 500);
      //  }, 900);
      break;
    case 'size':
      var which = '#'+msg.which;
      $(which).css({width:msg.width+'%', height:msg.height+'%'});
      break;
    case 'css':
      var which = '#'+msg.which;
      var property = msg.property;
      var value = msg.value;
      $(which).css(property,value);
      break;
    case 'html': // change the html of 'which' div
      $('#'+msg.which).html(msg.html);
      break;
    case 'position':
      $('#position').html(msg.position);
      break;
    case 'playing':
      if (msg.paddle == 'p1' || msg.paddle == 'p2') {
        playing = msg.paddle;
        paddle = $('#'+msg.paddle);
        paddle.css('background-color', 'white');
        ball.css('background-color', 'white');
        lastPaddleY = paddle.position().top;
        lastBallX = $('#ball').position().left;
        lastBallY = $('#ball').position().top;
        playLoop(msg.delay);
      }
      break;
    case 'move':  // time to move the divs
      deltax = $('#ball').position().left - lastBallX;
      lastBallX = $('#ball').position().left;
      lastBallY = $('#ball').position().top;
      colliding = ((playing == 'p1' && deltax < 0) ||
                   (playing == 'p2' && deltax > 0)) ? true : false;

      $('#ball').css({'top': msg.bally+'%', 'left': msg.ballx+'%'});
      $('#p1').css({'top': msg.p1pos+'%'});
      $('#p2').css({'top': msg.p2pos+'%'});
      if (playing) lastPaddleY = paddle.position().top;
      break;
    case 'collide':
      if (msg.value != undefined) {
        colliding = msg.value;
      } // else { $('#output2').html('collide malformed'); }
      break;
    case 'score':
      score(msg.which, msg.val);
      break;
    default: break;
  }
}

var socket = new io.Socket(null, {port: 9980, rememberTransport: false});
socket.connect();
// sends message to 'command' function
socket.on('message', function(obj){
  if ('buffer' in obj){
    for (var i in obj.buffer) command(obj.buffer[i]);
  } else command(obj);
});

var mouseY = 0, lastY = 0;

var paddleLimit = .05; // max percent per update
var delay = 50; // ms between updates

// paddle position is calculated locally and sent to server
// very slow - optimize, maybe offload to server somehow
function movePaddles() {
  //var readout = '';
  // get mouse position relative to court in pixels
  var targetY = mouseY - court.offset().top;
  if (Math.abs(targetY - lastY) < 2) return false; // too small to bother
  //readout += 'paddle: '+paddle.position().top;
  //readout += '<br>mouseY: '+mouseY;
  //readout += '<br>court.offset().top: '+court.offset().top;
  //readout += '<br>targetY: '+targetY;
  // THROTTLE PADDLE SPEED
  // get abs of distance since last update, measured from paddle center
  var delta = paddle.position().top + paddle.height()/2 - targetY;
  //readout += '<br>delta: '+delta;

  // convert to fracion and compare to speed limit
  delta1 = Math.abs(delta)/court.height();
  //readout += '<br>delta1: '+delta1;
  delta1 = Math.min(paddleLimit, delta1);
  //readout += '<br>delta1: '+delta1;

  // minimum movement = 2%
  if (delta1 < .02) return false;
  // set delta1 to sign of delta
  delta1 *= (delta < 0 ? -1 : 1);
  //readout += '<br>delta1: '+delta1;
  // calculate new fractional position
  targetY = (paddle.position().top/court.height() - delta1);
  //readout += '<br>targetY: '+targetY;
  // keep in court
  targetY = Math.min(targetY, (court.height()-paddle.height())/court.height());
  //readout += '<br>paddle.height(): '+String((court.height()-paddle.height())/court.height());
  targetY = Math.max(targetY, 0);
  lastY = targetY;

  //readout += '<br>targetY: '+targetY;
  // convert to fraction
  sendY = targetY*100;
  //readout += '<br>sendY: '+sendY;
  //readout += '<br>court.height(): '+court.height();
  //socket.broadcast({type:'move', which:playing, y:sendY});
  socket.send({type:'move', which:playing, y:sendY});
  //$('#readout').html(readout);
}

// returns ball at an angle based on point of contact with paddle
function english(yval) {
  var yfac = 1.5; // angle extremeness tuner
  yval *= 100;
  if (yval < 0) deltay = -1 * yfac;
  else if (yval < 10) deltay = -3 * yfac;
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
}

function collisionDetection() {
/*
      y1
      __
  x1 |  | x2
     |__|
      y2
*/


  // swept volume collision detection
  var ix1 = Math.min(ball.position().left, lastBallX);
  var ix2 = Math.max((ball.position().left + ball.width()), (lastBallX + ball.width()));
  var iy1 = Math.min(ball.position().top, lastBallY);
  var iy2 = Math.max((ball.position().top + ball.height()), (lastBallY + ball.height()));

  var px1 = paddle.position().left;
  var px2 = px1 + paddle.width();
  var py1 = Math.min(paddle.position().top, lastPaddleY);
  var py2 = Math.max(paddle.position().top + paddle.height(), lastPaddleY + paddle.height());

  var result = '';

  if (ix1 <= px2 && ix2 >= px1 && iy1 <= py2 && iy2 >= py1) {
    // successful return
    var rdmsg = "";
    // calculate english based on current relative positions
    var relativeY = ( ball.position().top+(ball.height()/2) - paddle.position().top ) / paddle.height();
    rdmsg += "ball.position().top: "+ball.position().top+"<br>";
    rdmsg += "ball.height(): "+ball.height()+"<br>";
    rdmsg += "paddle.position().top: "+paddle.position().top+"<br>";
    rdmsg += "paddle.height(): "+paddle.height()+"<br>";
    rdmsg += "relativeY: "+relativeY;
    //$("#readout").html(rdmsg);
    english((relativeY+.5)/2);
    colliding = false;

    socket.send({type:'return', which:playing, english:deltay});
  }
}

function ready() {
  $('#welcome').css('visibility','hidden');
  // turn on mouse tracking
  $(document).mousemove(function(e){ mouseY = e.pageY; });

  // turn on touch tracking
  $('#toucharea, #court').bind('touchstart touchmove', function(event) {
    var e = event.originalEvent;
    mouseY = e.touches[0].pageY;
    return false;
  });

  socket.send({type:'ready', name:$('#entername').val()});
}

var timer = 0;

function playLoop(delay) {
  timer++;
  if (playing) {
    setTimeout(playLoop, delay);
    socket.send({type:'heartBeat'});
    movePaddles();
    if (colliding) {collisionDetection();}
    // respond to server
  }
}

// helper function
function contains(a, obj) {
  var i = a.length;
  while (i--) {
    if (a[i] === obj) {
      return true;
    }
  }
  return false;
}
