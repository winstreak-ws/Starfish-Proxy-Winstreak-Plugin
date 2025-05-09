# Proxy Thing with Anticheat
## **Note: This is VERY MUCH in progress, expect everything to break and use at your own risk**
## Known Issues:
- Auth is not fully implemented and is extremely broken
- Code is largely AI generated and in need of major refactoring
- Just about everything else is also mostly broken
## How it is supposed to work:
- Main proxy logic should be in proxy.js
- Packet events are exposed through ProxyAPI, allowing custom scripts in /scripts
- Anything beyond basic packet passthrough should be handled in a script
## Planned changes / improvements:
- Move sendChatMessage function to proxy.js, since it is a useful feature for most scripts
- Finish implementing auth in proxy.js
- Add some way to choose server that isn't hard-coded into the source code
- Major refactoring everywhere
- Add more checks to anticheat.js so this actually has a purpose
- Perhaps add another script to detect cheaters from Urchin blacklist?
##### Also note: I am NOT a JavaScript dev, so I am aware all of this code is complete garbage
