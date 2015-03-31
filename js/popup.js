

(function($){


  $(document).ready(function(){


  var bgw = chrome.extension.getBackgroundPage();
  //access bg window methods and properties like so:
  //bgw._tsmSlackChromeExt.function();
  //bgw._tsmSlackChromeExt.messageQueue;


  //this will be replaced by bg window post method
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
      $('#response').html(JSON.stringify(response))
    });


  });




  });
})(jQuery);

