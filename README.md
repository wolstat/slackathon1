# slackathon1

GitHub:
https://github.com/wolstat/slackathon1

Set up Local Chrome Extension:
https://developer.chrome.com/extensions/getstarted#unpacked

Or install as a tester:
https://chrome.google.com/webstore/detail/tsm-slack-helper/dcjhmokcdfafldjdiddhckfnkfkbklkm?hl=en-US&gl=US

Generate an auth token for Slack:
https://api.slack.com/web#authentication


Known issues:
Authenticating works most reliably immediately after reloading the extension. If your attempt to authorize continues to fail, try reloading the extension via the chrome://extensions panel

Message highlight filtering and @notifications not working yet

Unread messages on reconnection may be recording one more than the actual number.