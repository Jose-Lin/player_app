import leancloud
from leancloud import Object, Query
import logging

leancloud.init("qrQew2d8gajlfzNGXHXD3crQ-gzGzoHsz", "TShOpWb7GJ9CS6SE7wXIHBhh")

player_query = Query('Player')
player_query.equal_to('name', 'WANG, YUDONG')
player = player_query.first()

transfer_query = Query('Transfer')
transfer_query.equal_to('player', player)
transfers = transfer_query.find()

print(f"球员: {player.get('name')}")
for t in transfers:
    print(f"转会: {t.get('fromClub')} → {t.get('toClub')}")