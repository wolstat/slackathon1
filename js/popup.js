(function($){

	var bg = chrome.extension.getBackgroundPage()._tsmSlackHelper;

	$(document).ready(function(){
		//access bg window methods and properties like so:
		//bgw._tsmSlackHelper.function();
		// access data: user[ data.user ].name
		// access data: channel[ data.channel ].name

		//listUsers.init();
		//displayMessage.init();
		bg.setPopEnv( window, $); //let bg.js know popup exists

		$( window ).unload(function() { //let bg.js know popup ceased to exist
			bg.unsetPopEnv();
		});

//////QA BUTTONS
		$('body').on('click', '.appname', function(e){
			bg.showQaLink();
		});

		$('body').on('click', '#qalink', function(e){
			bg.displayPanel( 'qa' );
			$('section#prefs').find('#qalink').hide();
		});

		$('body').on('click', '#logConvometa', function(e){
			bg.log("convometa ::"+JSON.stringify(bg.dee.convometa));
		});

		$('body').on('click', '#logUsermeta', function(e){
			bg.log("usermeta ::"+JSON.stringify(bg.dee.usermeta));
		});

		$('body').on('click', '#logRTM', function(e){
			bg.log("RTM START "+JSON.stringify(bg.rtm)+" RTM END");
		});

		$('body').on('click', '#checkWss', function(e){
			bg.checkWss();
		});

		$('body').on('click', '#oauth2', function(e){
			bg.getToken();
		});

		$('body').on('click', '#logactive', function(e){
			bg.log("active START "+JSON.stringify(bg.active)+" active END");
		});

		$('body').on('click', '#authSlack', function(e){
			bg.getToken();
		});

		$('body').on('click', '#goconvo button', function(e){
	        bg.displayPanel('reply');
	        //return false;
	    });

		$('body').on('click', '#restartWss', function(e){
			bg.restartWss();
		});

		$('body').on('click', '#chromeTab', function(e){
			bg.log(JSON.stringify(bg.active.chromeTab));
		});
		
////////END QA BUTTONS


		$('body').on('click', '#clearPrefs', function(e){
			bg.clearPrefs();
		});

		$('body').on('click', '#start-session', function(e){
	        bg.saveAuth( $('form#preferences').serializeObject() );
	        //return false;
	    });

		$('body').on('click', '#viewprofile button', function(e){
	        bg.displayPanel('profile');
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

	    $(document).on('click', 'button.nav', function(e){
	    	panel = $(e.target).attr('data-panel');
			bg.displayPanel( panel );
	    });

		$(document).on('click', '#convo tr', function(e) {
			if ( thisconvo = $(this).attr('id') ) { bg.clickConvo( thisconvo );}
		});

		$(document).on('click', '#users .team', function(e) {
			if ( thisconvo = $(this).attr('data-convo-id') ) { bg.clickConvo( thisconvo );}
		});

		$('body').on('click', '.post', function(e){
			var msg = document.getElementById('msg').value;
			bg.postMessage(msg);
		});

		/*$(document).on('click', '.slacklink', function(e) {
			if ( thisconvo = $(this).attr('data-slack-uri') ) { bg.clickConvo( thisconvo );}
		}); */

		$(document).on('click', '#users span.team img', function(e) {
			bg.clickUser( $(e.target).closest('span.team').attr('id') );
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
	});
})(jQuery);

