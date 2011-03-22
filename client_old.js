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
    element = '#'+which+' #s'+x;
    $(element).css('visibility', 'hidden');
    $(element).css('background-color', 'green');
  }
  for (x in scores[val]) {
    element = '#'+which+' #s'+scores[val][x];
    //alert('val: '+x);
    $(element).css('visibility', 'visible');
    $(element).css('background-color', 'black');
  }
}

score('score1', 0);
score('score2', 0);

var p1 = $("#p1"), p2 = $("#p2"), ball = $("#ball"), court = $("#court");
var displayText;

// this command is triggered by the server's "broadcast"
function command(msg){
  //$('#status1').html(msg.type+"<br>"+$('#status1').html());

  switch(msg.type) {
    case "newgame":
      p1.css('visibility', 'visible');
      //p1.css('width', paddleWidth); // legacy from server-side
      //p1.css('height', paddleHeight);
      p2.css('visibility', 'visible');
      //p2.css('width', paddleWidth);
      //p2.css('height', paddleHeight);
      break;
    case "endgame":
      //$('#status1').html("GAMEOVER");
      colliding = false;
      playing = false;
      paddle = '';
      ball.css('visibility', 'hidden');
      p1.css('background-color', 'grey');
      p2.css('background-color', 'grey');
      p1.css('visibility', 'hidden');
      p2.css('visibility', 'hidden');
      break;
    case 'display':
      clearTimeout(displayText); // if there's a timeout already, override
      $('#alert').html(msg.alert);
      $('#alert').css('opacity', 1);
      displayText = setTimeout( function() {
        //$('#alert').html("cleared");
        $('#alert').animate({opacity: 0}, 500);
        }, 900);
      //$('#alert').html("alert: "+alert);
      break;
    case 'size':
      var which = '#'+msg.which;
      $(which).css({width:msg.width, height:msg.height});
      break;
    case 'css':
      var which = '#'+msg.which;
      var property = msg.property;
      var value = msg.value;
      $(which).css(property,value);
      break;
    case 'html':
      $('#status2').html(msg.html);
      break;
    case 'position':
      $('#position').html(msg.position);
      break;
    case 'playing':
      if (msg.paddle == "p1" || msg.paddle == "p2") {
        playing = msg.paddle;
        paddle = $("#"+msg.paddle);
        paddle.css('background-color', 'blue');
        ball.css('background-color', 'black');
        lastPaddleY = paddle.position().top;
        lastBallX = $('#ball').position().left;
        lastBallY = $('#ball').position().top;
        //$('#output2').html('msg.paddle else: '+msg.paddle+"<br>playing: "+playing);
        playLoop(msg.delay);
      }
      break;
    case 'move':  // time to move the divs
      deltax = $('#ball').position().left - lastBallX;
      lastBallX = $('#ball').position().left;
      lastBallY = $('#ball').position().top;
      colliding = ((playing == "p1" && deltax < 0) ||
                   (playing == "p2" && deltax > 0)) ? true : false;

      $('#ball').css({'top': msg.bally+'px', 'left': msg.ballx+'px'});
      $('#p1').css({'top': msg.p1pos+'px'});
      $('#p2').css({'top': msg.p2pos+'px'});
      if (playing) lastPaddleY = paddle.position().top;
      break;
    case 'collide':
      //$('#output2').html('collide: '+msg.value);
      if (msg.value != undefined) {
        colliding = msg.value;
        if (msg.value) paddle.css('background-color', 'red');
        else paddle.css('background-color', 'blue');
      } // else { $('#output2').html('collide malformed'); }
      break;
    case 'score':
      score(msg.which, msg.val);
      break;
    case 'board':
      if (msg.mode == "remove") {
        $('#board li:eq('+msg.remove+')').remove();

        var output = $('#output').html();
        output+= 'remove '+msg.remove+"<br>";
        //$('#output').html(output);

      } else if (msg.mode == "add") {
        var newli = "<li>" + msg.name + " " + msg.wins + " "+msg.losses+"</li>";
        $('#board').append(newli);

        var output = $('#output').html();
        output+= 'add '+msg.name+"<br>";
        //$('#output').html(output);

      } else if (msg.mode == "win") {
        // wins are only incremented after the winner is index 0
        $('#board li:eq(0)').html(msg.name+" "+msg.wins+" "+msg.losses);
        var output = $('#output').html();
        output+= 'win '+msg.name+"<br>";
        //$('#output').html(output);

      }
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

var mouseY = 0;

var paddleLimit = 20; // max pixels per millisecond
var delay = 50; // ms between updates

// paddle position is calculated locally and sent to server
function movePaddles() {
  // get mouse position relative to court
  var targetY = mouseY - court.position().top;

  // THROTTLE PADDLE SPEED

  // get abs of distance since last update
  var delta = paddle.position().top - targetY;
  // compare to speed limit
  delta1 = Math.min(paddleLimit * delay/20, Math.abs(delta));
  // minimum movement = 5px
  delta1 = delta1 >  5 ? delta1 : 0;
  delta1 *= (delta < 0 ? -1 : 1); // keep sign
  // calculate new position
  targetY = paddle.position().top - delta1;
  // keep in court
  targetY = Math.min(targetY, court.height()-paddle.height());
  targetY = Math.max(targetY, 0);

  socket.send({type:'move', which:playing, y:targetY});
}

// returns ball at an angle based on point of contact with paddle
function english(yval) {
  yval /= paddle.height() / 100;
  if (yval < 10) deltay = -20;
  else if (yval < 20) deltay = -8;
  else if (yval < 30) deltay = -6;
  else if (yval < 40) deltay = -4;
  else if (yval < 50) deltay = -2;
  else if (yval < 60) deltay = 0;
  else if (yval < 70) deltay = 2;
  else if (yval < 80) deltay = 4;
  else if (yval < 90) deltay = 6;
  else if (yval < 100) deltay = 8;
  else deltay = 20;
  ///deltay *= Math.abs(deltax/10); // not sure how this works
}

function collisionDetection() {
  //$('#output2').html("paddle.position().top: "+paddle.position().top);
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

  // Test for paddle/ball overlap
  //$('#output2').html('ix1:'+ix1+' ix2:'+ix2+' px1:'+px1+' px2:'+px2+' iy1:'+iy1+' iy2:'+iy2+' py1:'+py1+' py2:'+py2);
  //$('#output2').html('paddle.css(top):'+paddle.position().top+' paddle.position().top:'+paddle.position().top);

  if (ix1 <= px2 && ix2 >= px1 && iy1 <= py2 && iy2 >= py1) {
    // successful return

    // calculate english based on current relative positions
    var relativeY = ball.position().top+(ball.width()/2) - paddle.position().top;
    english(relativeY);
    colliding = false;
    paddle.css('background-color', 'blue');

    //$('#output2').html('Return!');

    socket.send({type:'return', which:playing, english:deltay});
  }
}

function ready() {
  $("#welcome").css("visibility","hidden");
  $(document).mousemove(function(e){ mouseY = e.pageY; }); // turn on mouse tracking

  // i don't think this works
  //$(court).tap(function(e){
  //  $("#output").html(e.pageY);
  //});

  // activate paddle touch areas
  //$("#p1touch").draggable();
  //$("#p2touch").draggable();
  socket.send({type:'ready', name:$("#entername").val()});
}

var timer = 0;

function playLoop(delay) {
  timer++;
  if (playing) {
    movePaddles();
    if (colliding) {collisionDetection();}
    setTimeout(playLoop, delay);
    // respond to server
    socket.send({type:'heartBeat'});
  }
}

function contains(a, obj) {
  var i = a.length;
  while (i--) {
    if (a[i] === obj) {
      return true;
    }
  }
  return false;
}

//setTimeout($('#alert').fadeTo('slow', 0.5), 1000);
//$('#alert').fadeTo('slow', 0.5);
