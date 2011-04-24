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
  //readout.html(String($(window).width()));
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
var colliding = false; // only players check for collisions
var paddle = '';
var lastBallX = 0, lastBallY = 0;
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
var readout = $('#readout');
var readout2 = $('#readout2');
var displayText;

// this command is triggered by the server's 'broadcast'
function command(msg){

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
      }, 100);
      break;

    case 'css':
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

    case 'score':
      score(msg.which, msg.val);
      break;
    
    // move ball
    case 'moveBall':
    	readout.html('MOVEBALL - startx: '+msg.startx+', starty: '+msg.starty+'<br>deltax: '+deltax+', deltay: '+deltay);
    	ball.stop(true, true);
    	ball.css('visibility', 'visible');
    	ball.css('left', msg.startx+"%" );
    	ball.css('top', msg.starty+"%" );
			deltax = msg.deltax;
			deltay = msg.deltay;
			moveBall();
    	break;
      
    case 'move':
			p1.css({'top': msg.p1pos+'%'});
			p2.css({'top': msg.p2pos+'%'});
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

// send mouse position to the server
function movePaddles() {
  // get mouse position relative to court height as fraction
  var targetY = (mouseY - court.offset().top) / court.height();

  // if mouse has moved, send new position to server
  if (lastY != targetY) socket.send({type:'move', which:playing, y:targetY});
  lastY = targetY;
}

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

  socket.send({type:'ready', name:$('#entername').val()});
}

function playLoop(arg) {
  if (playing) {
    setTimeout('playLoop('+arg+')', arg);
    movePaddles();
  }
}

function moveBall() {
	ball.animate({left: '+='+deltax+"%", top: '+='+deltay+"%"}, {duration: 20, complete: function() {moveBall();} });
	//alert(ball.position().left);
 	readout2.html('deltax: '+Math.round(deltax*100)/100+', deltay: '+Math.round(deltay*100)/100+'<br>ballx: '+ball.position().left+', bally: '+ball.position().top);

	// bounce off of walls
	if (ball.position().top < 10) {
		//ball.stop(true);
		ball.css('top', 0);
		deltay = Math.abs(deltay);
   	readout.html('TOP - deltax: '+deltax+', deltay: '+deltay);
		//moveBall();
	}
	else if (ball.position().top > court.height() - ball.height()*2) {
		//ball.stop(true);
		readout.html("BOTTOM");
		ball.css('top', court.height() - ball.height());
		deltay = Math.abs(deltay)*-1;
   	readout.html('BOTTOM - deltax: '+deltax+', deltay: '+deltay);
   	//moveBall();
	}
	if (colliding) collisionDetection();
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

function logIn() {
  $('#splash').css('display', 'none');
  $('#insertcoin').css('display', 'none');
  $('.hide').css('display', 'inline');
  $('#welcome').css('display', 'inline');
}

function insertcoin() {
  coinBounce = false;
  $("#play").css('color', 'red');
  starting = true;
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

// detect collisions between ball and paddle
function collisionDetection() {
  ballx = Math.abs(	court.width()/2 - ball.position().left-( .5*ball.width() ) ) / court.width()*100;
  //ballx = Math.abs(	court.width()/2 - ball.position().left ) / court.width()*100;
	
  bally = ball.position().top;
  p1y = p1.position().top;
  p2y = p2.position().top;
	returned = 0;

	//out = readout.html();
	//out += '<br>colliding';
	//readout.html(out);
  //$('#readout').html('ballx: '+ballx+'<br>bally: '+bally+'<br>p1y: '+p1y+'<br>p2y: '+p2y+
  //		'<br>p2y - ball.height(): '+(p2y-ball.height())+'<br>p2y + p2.height(): '+(p2y+p2.height()));
	readout.html('ballx: '+ballx);
	// ball in right x zone? front edge of paddle..halfway off backside of paddle
	// prevents backedge returns, which feel cheaty
  if (ballx >= 40.5 && ballx <= 45.1875) {
		if (ball.position().left < court.width()/2) {
      // ball in p1's y zone?
			if ( bally >= p1y - ball.height() && bally <= p1y + p1.height() ) {
				out = readout.html();
				out += '<br>COLLIDE P1';
			  readout.html(out);
				returned = 1;
				which = 'p1';
				//ball.stop();
			} //else $('#readout').html('no collide left');
		} else if (bally >= p2y - ball.height() && bally <= p2y + p2.height() ) {
				out = $('#readout').html();
				out += '<br>COLLIDE P2';
			  $('#readout').html(out);
				returned = 1;
				which = 'p2';
		} //else $('#readout').html('no collide right');
	}

  // a magnificent return
	if (returned) {
    //ball.stop(true); // true = cancel animate() queue

    // get relative y position so server can calculate english
    var angle = (ball.position().top + ball.height() - paddle.position().top)/court.height()*100;
    
    //readout.html('Return!<br>startx: '+(ball.position().left / court.width() * 100)+'startx: '+(ball.position().top / court.height() * 100)+'which: '+which+', angle: '+angle);
    socket.send({type: 'return',
    						 startx: ball.position().left / court.width() * 100,
    						 starty: ball.position().top / court.height() * 100,
    						 which: which,
    						 angle: angle});
  }

	// GOOOOOOOOOOOOOOAL  
  if (ball.position().left < court.width()*.02) {
		//testing
		//readout.html('p1score');
		socket.send({type:'score', which:'p1'});
		ball.stop(true);
	} else if  (ball.position().left > court.width()*.98) {
		//readout.html('p2score');
		socket.send({type:'score', which:'p2'});
		ball.stop(true);
	}
}

// set animation speed: delay between updates in milliseconds
// equivalent to 20 frames per second
jQuery.fx.interval = 50;