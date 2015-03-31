

(function($){


  $(document).ready(function(){




//https://slack.com/api/chat.postMessage
//U033Z49JK wolstat id
  //$('body').on('click', '.addcomment .sendform', function(e){
    //alert('foo');


  
  //});


  $('body').on('click', '.test', function(e){
    //alert('foo');
    var method = "chat.postMessage";
    var token = "?token=xoxp-3118431681-3135145631-4229637403-9444ae";
    var msg = $('#msg').val();
    var request = $.ajax({
      url: "https://slack.com/api/"+method+token,
      type: "get",
      data:  {
    //"id": 1,
    "as_user" : true,
    "type": "message",
    "channel": "C0458GXEA", //"C033GCPLP",
    "text": msg
},
      dataType: "json"
    }).done( function(response){
      //console.log("base+method+token: "+JSON.stringify(response)); //full project doc - update $scope var?
      //location.reload();
      $('#response').html(JSON.stringify(response))
    });


  });




  });
})(jQuery);

