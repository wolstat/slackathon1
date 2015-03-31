(function($){

	var listUsers = {
		init: function(){
			var _self = this;
			_self.bindEvents();
			messageQueue.forEach(function(data){
				$('#header').find('.tabs ul').append("<li class='"+ data.channel + data.ts + "'>"+ data.user +"</li>");
			})
		},
		bindEvents: function(){
			$(document).on('click', '#header .tabs .left.arrow', function(e){
				$('.tabs ul').prepend($(".tabs ul>li:last"));
			})
			$(document).on('click', '#header .tabs .right.arrow', function(e){
				$('.tabs ul').append($(".tabs ul>li:first"));
			})
		}
	};

	var displayMessage = {
		init: function(){
			var _self = this;
			_self.bindEvents();
		},
		bindEvents: function(){
			$(document).on('click', '#header .tabs li', function(e) {
				var channel = $(this).attr('class');
				$('#header .tabs li.active').removeClass('active');
				$(this).addClass("active");
				messageQueue.forEach(function(data){
					if (data.channel + data.ts == channel){
						var d = new Date(parseFloat(data.ts));
						$('#content .name').text(data.user);
						$('#content .timestamp').text( d.toLocaleDateString() + " at " + d.toLocaleTimeString());
						$('#content .message').text(data.text);
						//$('#content .slack_open').attr('href',"https://tsmproducts.slack.com/messages/" + data.channel)
					}
				})
			})
		}
	};

	$(document).ready(function(){


		var bgw = chrome.extension.getBackgroundPage();
		//access bg window methods and properties like so:
		//bgw._tsmSlackChromeExt.function();
    var mQ = bgw._tsmSlackChromeExt.messageQueue;
    var user = bgw._tsmSlackChromeExt.userData;
    // access data: user[ data.user ].name
    var channel = bgw._tsmSlackChromeExt.channelData;
    // access data: channel[ data.channel ].name

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

