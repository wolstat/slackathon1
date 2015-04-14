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

		$('body').on('click', '#logConvometa', function(e){
			bg.logConvometa();
		});



		$('body').on('click', '#popMsgCount', function(e){
			alert(JSON.stringify(bg.dee.convometa));
		});

		$('body').on('click', '#logUsermeta', function(e){
			bg.logUsermeta();
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

		$('body').on('click', '#viewprofile button', function(e){
	        bg.viewProfile();
	        //return false;
	    });


	    $(document).on('click', 'nav.nav span', function(e){
	    	var pcheck, panel, obj;
	    	if ( pcheck = $(e.target).attr('data-panel') ) {
	    		panel = pcheck;
	    		obj = $(e.target)
	    	} else {
	    		obj = $(e.target).closest('span');
	    		panel = obj.attr('data-panel');
	    	}
	    	//console.log('click : '+e.target.className);
	      	bg.displayPanel( panel );
	    });

	    $(document).on('click', '#reply .cancel', function(e){
	    	//clickCancelPanel( panel ); reset active.lastPanel
	      bg.goLastPanel();
	    });

		$(document).on('click', '#convo tr', function(e) {
			if ( thisconvo = $(this).attr('id') ) { bg.clickConvo( thisconvo );}
		});

		$(document).on('click', '#users span.team img', function(e) {
			bg.clickUser( $(e.target).closest('span.team').attr('id') );
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


/*
	$("nav.nav span").click(function(){
		$(this).blur();
	});
	//When mouse rolls over
	$("nav.nav span").mouseover(function(){
		if ( $(this).hasClass('selected') ) return;
		$(this).stop().animate({'background-position-x':"0px"},{queue:false, duration:300, easing: 'easeOutQuart'});
		$(this).find('em').stop().animate({'top':'0px'},{queue:false, duration:200, easing: 'easeOutQuart'});
	});
	//When mouse is removed
	$("nav.nav span").mouseout(function(){
		if ( $(this).hasClass('selected') ) return;
		$(this).stop().animate({'background-position-x':'82px'},{queue:false, duration:200, easing: 'easeOutQuart'});
		$(this).find('em').stop().animate({'top':'24px'},{queue:false, duration:150, easing: 'easeOutQuart'});
	});
*/

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

