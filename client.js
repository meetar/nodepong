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
  //$("#readout").html(String($(window).width()));
}

$(document).ready(function() {
  scrollWindow();
  window.onorientationchange = scrollWindow;

  $('#entername').val(makeid());
  $('#entername').select();
  $('#entername').onfocus = '$(\'#entername\').value = \'\';';

  // click play and accept default name for fast testing
  insertcoin();
  ready();

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

// this command is triggered by the server's 'broadcast'
function command(msg){

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
      $('#playerhide').css('visibility', 'hidden');
      p1.css('background-color', 'gray');
      p2.css('background-color', 'gray');
      break;
    case 'display':
      clearTimeout(displayText); // if there's a timeout already, override
      $('#alert').html(msg.alert);
      $('#alert').css('visibility', 'visible');
      displayText = setTimeout( function() {
        $('#alert').css('visibility', 'hidden');
      }, 1000);
      break;
    case 'css':
      $('#'+msg.which).css(msg.property, msg.value);
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
        lastBallX = ball.position().left;
        lastBallY = ball.position().top;
        playLoop(msg.delay*1); // .8 seems to reduce lag?
      }
      break;
    case 'move':  // time to move the divs
      deltax = ball.position().left - lastBallX;
      lastBallX = ball.position().left;
      lastBallY = ball.position().top;
      colliding = ((playing == 'p1' && deltax < 0) ||
                   (playing == 'p2' && deltax > 0)) ? true : false;

      ball.css({'top': msg.bally+'%', 'left': msg.ballx+'%'});
      p1.css({'top': msg.p1pos+'%'});
      p2.css({'top': msg.p2pos+'%'});
      if (playing) lastPaddleY = paddle.position().top;

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

// move paddles incrementally to the target position
function movePaddles() {
  // get mouse position relative to court height as fraction
  var targetY = (mouseY - court.offset().top) / court.height();

  // if mouse has moved, send new position to server
  if (lastY != targetY) socket.send({type:'move', which:playing, y:targetY});
  lastY = targetY;
}

// returns ball at an angle based on point of contact with paddle
function english(yval) {
  var yfac = 1.5; // angle extremeness tuner
  yval *= 100;
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
}

// a bit slow - possible to offload this to server too?
// maybe send all vars to server on resize()
function collisionDetection() {
/*
     y1
     __
  x1|  |x2
    |__|
     y2
*/

  var bwidth = ball.width();
  var bheight = ball.height();
  var bleft = ball.position().left;
  var btop = ball.position().top;

  // swept volume collision detection
  var ix1 = Math.min(bleft, lastBallX);
  var ix2 = Math.max((bleft + bwidth), (lastBallX + bwidth));
  var iy1 = Math.min(btop, lastBallY);
  var iy2 = Math.max((btop + bheight), (lastBallY + bheight));

  var ptop = paddle.position().top;
  var pheight = paddle.height();

  var px1 = paddle.position().left;
  var px2 = px1 + paddle.width();
  var py1 = Math.min(ptop, lastPaddleY);
  var py2 = Math.max(ptop + pheight, lastPaddleY + pheight);

  var result = '';

  if (ix1 <= px2 && ix2 >= px1 && iy1 <= py2 && iy2 >= py1) {
    // successful return
    var rdmsg = "";
    // calculate english based on current relative positions
    var relativeY = ( btop+(bheight/2) - ptop ) / pheight;

    english((relativeY+.5)/2); // .5/2 is tweak - angle is a bit off
    colliding = false;

    socket.send({type:'return', which:playing, english:deltay});
  }
}

function ready() {
  $('#welcome').css('visibility','hidden');
  //$('.center').css('display','none');
  $('#insertcoin').css('display','none');
  // turn on mouse tracking
  $(document).mousemove(function(e){ mouseY = e.pageY; });

  // turn on touch tracking
  //$('#toucharea, #court').bind('touchstart touchmove', function(event) {
  $('#toucharea').bind('touchstart touchmove', function(event) {
    var e = event.originalEvent;
    mouseY = e.touches[0].pageY;
    return false;
  });

  socket.send({type:'ready', name:$('#entername').val()});
}

function playLoop(arg) {
  if (playing) {
    setTimeout('playLoop('+arg+')', arg);
    // socket.send({type:'heartBeat'});
    movePaddles();
    // testing: moved collision detection to the server
    //if (colliding) {collisionDetection();}
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

// no thanks, just browsing
function spectate() {
  $("#coin").animate({
    right: '0'
  }, 250, function() {
    $('#splash').css('display', 'none');
    $('#insertcoin').css('display', 'inline');
    $('#hide').css('display', 'inline');
    //$('#hide').css('top', '0');
    $('#welcome').css('display', 'none');

    socket.send({type:'watching'});
  });
}

var coinBounce = false, starting = false;

function bounceCoin() {
  $("#coin").animate({ top: '-.1em' }, 50);
  if (coinBounce) setTimeout( function() {
    $("#coin").animate({ top: '+.1em' }, 50);
  }, 50);
  if (coinBounce) setTimeout( function () {
    if (coinBounce) bounceCoin();
  }, 100);
}

function coinLeft() {
  $("#coin").animate({ right: '.33em' }, 100);
  coinBounce = true;
  bounceCoin();
}

function coinRight() {
  if (!starting) {
    coinBounce = false;
    $("#coin").animate({ right: '0em', top: '0' }, 100);
  }
}

function logIn() {
  $('#splash').css('display', 'none');
  $('#insertcoin').css('display', 'none');
  $('.hide').css('display', 'inline');
  //$('#hide').css('top', '0');
  $('#welcome').css('display', 'inline');
}

function insertcoin() {
  coinBounce = false;
  $("#play").css('color', 'red');
  starting = true;
  $("#coin").animate({
    right: '+=.25em'
  }, 100, 'linear', function() {
    $("#coin").animate({
      right: '2.1em'
    }, 250, 'linear', function() {
      setTimeout('logIn()', 500);
    });
  });
}

$("#play").hover(function() {
    coinLeft();
  }, function() {
    coinRight()
});

jQuery.fx.interval = 50;