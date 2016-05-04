      $(document).ready(function () {
          var audioElement = document.createElement('audio');
          audioElement.setAttribute('src', 'audio/joeey.mp3');
          audioElement.setAttribute('autoplay:false', 'autoplay');
          //audioElement.load code above. if you take out :false from the code the file will auto play than everythin works the same after that()
          $.get();
          audioElement.addEventListener("load", function () {
              audioElement.play();
          }, true);


          $(document).keypress(function (e) {
              if (e.which == 13) { //press enter the audio will play
                  audioElement.play();

              } else if (e.which == 32) { //press spacebar the audio will                             pause play
                  audioElement.pause();
              }
          });

// the code below wil allow you to click the play and stop button with the mouse
          $('.play-button').click(function () { 
              audioElement.play();
          });


          $('.pause').click(function () {
              audioElement.pause();
          });
      });