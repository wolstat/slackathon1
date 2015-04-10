(function($){

	var bg = chrome.extension.getBackgroundPage()._tsmSlackChromeExt;
	if ( bg.has.auth ) {
	    var me = bg.rtm.self,
	    mQ = bg.rtm.messages,
	    cc = bg.rtm.convos,
	    channel = bg.rtm.channels,
	    users = bg.rtm.users;
	}

	$(document).ready(function(){
		//access bg window methods and properties like so:
		//bgw._tsmSlackChromeExt.function();
		// access data: user[ data.user ].name
		// access data: channel[ data.channel ].name

		//listUsers.init();
		//displayMessage.init();
		bg.setPopEnv( window, $);

		$( window ).unload(function() {
			bg.unsetPopEnv();
		});

		$('body').on('click', '#clearPrefs', function(e){
			bg.clearPrefs();
		});

		$('body').on('click', '#authSlack', function(e){
			bg.getToken();
		});

		$('body').on('click', '#logConvos', function(e){
			bg.logConvos();
		});

		$('body').on('click', '#restartWss', function(e){
			bg.startWss( bg.prefs.authToken );
		});

		$('body').on('click', '#testWss', function(e){
			bg.testWss();
		});

		$('body').on('click', '#start-session', function(e){
	        bg.saveAuth( $('form#preferences').serializeObject() );
	        //return false;
	    });


	    $(document).on('click', 'nav.nav span, .nav button', function(e){
	      bg.displayPanel(e.target.className);
	    });

		$(document).on('click', '#header .tabs li', function(e) {
			bg.displayMessage(e.target.className);
		});

		$(document).on('click', '#convo tr', function(e) {
			if ( thisconvo = $(this).attr('id') ) { bg.clickConvo( thisconvo );}
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

		//this will be replaced by bg window post method
		$('body').on('click', '.test', function(e){
			var method = "chat.postMessage";
			var token = "?token=xoxp-3118431681-3135145631-4229637403-9444ae";//+bg.prefs.authToken;
			var msg = document.getElementById('msg').value; //$('#msg').val();
			var channel = bg.active.convo;
			console.log("click:"+typeof msg+"::"+msg.length);
			var request = $.ajax({
				url: "https://slack.com/api/"+method+token,
				type: "get",
				data:  {
					//"id": 1,
					"as_user" : true,
					"type": "message",
					"channel": channel, // "C0458GXEA", //"C033GCPLP",
					"text": msg
				},
				dataType: "json"
			}).done( function(response){
				console.log(" ajax resomnse "+JSON.stringify(response))
			});
		});


	});
})(jQuery);

