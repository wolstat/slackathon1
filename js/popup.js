(function($){

if ( chrome.extension ) {
	var bg = chrome.extension.getBackgroundPage()._tsmSlackChromeExt,
    me = bg.rtm.self,
    mQ = bg.rtm.messages,
    cc = bg.rtm.convos,
    channel = bg.rtm.channels,
    users = bg.rtm.users;
}

    //bg.getConvos() //loop through unread convo list and update header display
    //bg.sendMessage( message, convo ) //send message to slack convo
    //bg.switchPanel( panel )//switch between users status, preference and convo panes
    //bg.savePrefs( data ) //save k/v pairs of prefs // uid/token to start
    //
/*

	var listUsers = {
		init: function(){
			var _self = this;
			_self.bindEvents();
			$.each(member, function(index, data){
				if (data.unread_count > 0){
					$('#header').find('.tabs ul').append("<li class='"+ data.id + data.last_read + "'>"+ data.name +"</li>");
				}
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
		foo : function(){ alert("displayMessage.foo") },
		init: function(){
			var _self = this;
			_self.bindEvents();
		},
		bindEvents: function(){
			$(document).on('click', '#header .tabs li', function(e) {
				var channel = $(this).attr('class');
				$('#header .tabs li.active').removeClass('active');
				$(this).addClass("active");
				$.each(member, function(index, data){
					if (data.id + data.last_read == channel){
						var d = new Date(parseFloat(data.latest.ts) * 1000);
						var today = new Date();
						$.each(user, function(index2, data2){
							if (data.latest.user == data2.id){
								$('#content .name').text(data2.real_name);
								$('#content .pic').attr('src',data2.profile.image_192);
							}
						});
						if (d.toLocaleDateString() == today.toLocaleDateString()){
							$('#content .timestamp').text("Today at " + d.toLocaleTimeString());
						}
						else {
							$('#content .timestamp').text( d.toLocaleDateString() + " at " + d.toLocaleTimeString());
						}
						$('#content .message').text(data.latest.text);
						//$('#content .slack_open').attr('href',"https://tsmproducts.slack.com/messages/" + data.channel)
					}
				})
			})
		}
	};
*/
	$(document).ready(function(){
		//access bg window methods and properties like so:
		//bgw._tsmSlackChromeExt.function();
		// access data: user[ data.user ].name
		// access data: channel[ data.channel ].name

if ( chrome.extension ) {

		//listUsers.init();
		//displayMessage.init();
		bg.setPopEnv( window, $);
		$( window ).unload(function() {
			bg.unsetPopEnv();
		});


    $(document).on('click', 'nav.nav button', function(e){
      bg.displayPanel(e.target.className);
    });

	$(document).on('click', '#header .tabs li', function(e) {
		bg.displayMessage(e.target.className);
	});

			$(document).on('click', '#header .tabs .left.arrow', function(e){
				$('.tabs ul').prepend($(".tabs ul>li:last"));
			});
			$(document).on('click', '#header .tabs .right.arrow', function(e){
				$('.tabs ul').append($(".tabs ul>li:first"));
			});


	$.fn.serializeObject = function(){
	    var o = {};
	    var a = this.serializeArray();
	    $.each(a, function() {
	        if (o[this.name] !== undefined) {
	            if (!o[this.name].push) {
	                o[this.name] = [o[this.name]];
	            }
	            o[this.name].push(this.value || '');
	        } else {
	            o[this.name] = this.value || '';
	        }
	    });
	    return o;
	};

	$(function() {
	    $('form#preferences').submit( function() {
	        bg.saveAuth( $('form#preferences').serializeObject() );
	        return false;
	    });
	});

		$('body').on('click', '#clearPrefs', function(e){
			bg.clearPrefs();
		});


} //chrome

		//this will be replaced by bg window post method
		$('body').on('click', '.test', function(e){
			var method = "chat.postMessage";
			var token = "?token=xoxp-3118431681-3135145631-4229637403-9444ae";
			var msg = 'test';// document.getElementById('msg').value; //$('#msg').val();
		console.log("click:"+typeof msg+"::"+msg.length);
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

