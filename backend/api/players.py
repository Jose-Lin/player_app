from flask import Flask, request, jsonify
from leancloud import LeanCloudError, Object, Query
import os
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)

class Player(Object):
    pass

@app.route('/api/players', methods=['GET'])
def get_players():
    try:
        query = Query(Player)
        if 'nationality' in request.args:
            query.equal_to('nationality', request.args['nationality'])
        players = query.find()
        return jsonify([{
            'id': p.id,
            'name': p.get('name'),
            'club': p.get('currentClub')
        } for p in players]), 200
    except LeanCloudError as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/players/<player_id>', methods=['PUT'])
def update_player(player_id):
    try:
        player = Query(Player).get(player_id)
        data = request.json
        for key in ['name', 'currentClub']:
            if key in data:
                player.set(key, data[key])
        player.save()
        return jsonify({'status': 'success'}), 200
    except LeanCloudError as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    app.run()