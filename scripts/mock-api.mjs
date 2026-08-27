/**
 * Servidor local que imita a API publica de battle data.
 *
 * Serve dois propositos: permitir testar o app de ponta a ponta sem depender da
 * rede externa, e exercitar o normalizador contra um payload em formato
 * realista (nomes de campo em snake_case, usage em escala 0-100, spread como
 * string "Nature:0/252/...").
 */
import { createServer } from 'node:http';

const MONS = [
  ['garchomp', 30.8, 'Rough Skin', 'Life Orb', ['Earthquake','Dragon Claw','Protect','Rock Slide'], 'Adamant:8/256/0/0/0/256', [['charizardmegay',16.3],['sinistcha',11.2],['whimsicott',9.4]]],
  ['sinistcha', 24.1, 'Hospitality', 'Sitrus Berry', ['Matcha Gotcha','Shadow Ball','Rage Powder','Trick Room'], 'Bold:256/0/256/0/16/0', [['garchomp',11.2],['kingambit',8.1]]],
  ['basculegion', 21.3, 'Swift Swim', 'Choice Band', ['Wave Crash','Last Respects','Aqua Jet','Protect'], 'Adamant:16/256/0/0/0/256', [['whimsicott',10.2],['rillaboom',7.7]]],
  ['whimsicott', 19.4, 'Prankster', 'Focus Sash', ['Moonblast','Tailwind','Encore','Protect'], 'Timid:112/0/0/160/0/256', [['basculegion',10.2],['garchomp',9.4]]],
  ['kingambit', 18.2, 'Supreme Overlord', 'Black Glasses', ['Sucker Punch','Kowtow Cleave','Iron Head','Protect'], 'Adamant:192/256/80/0/0/0', [['sinistcha',8.1],['amoonguss',6.4]]],
  ['charizardmegay', 17.4, 'Drought', 'Charizardite Y', ['Heat Wave','Solar Beam','Air Slash','Protect'], 'Modest:64/0/0/256/0/208', [['garchomp',16.3]]],
  ['landorustherian', 16.1, 'Intimidate', 'Rocky Helmet', ['Earthquake','Rock Slide','U-turn','Protect'], 'Impish:256/0/192/0/0/80', [['sinistcha',6.9]]],
  ['sylveon', 14.2, 'Pixilate', 'Throat Spray', ['Hyper Voice','Moonblast','Protect','Helping Hand'], 'Modest:256/0/0/256/16/0', [['amoonguss',5.5]]],
  ['floettemega', 12.5, 'Flower Veil', 'Floettite', ['Moonblast','Dazzling Gleam','Protect','Light Screen'], 'Modest:16/0/0/256/0/256', [['rillaboom',4.8]]],
  ['sneasler', 11.3, 'Unburden', 'Focus Sash', ['Close Combat','Dire Claw','Fake Out','Protect'], 'Adamant:16/256/0/0/0/256', [['kingambit',4.2]]],
  ['rillaboom', 10.4, 'Grassy Surge', 'Assault Vest', ['Grassy Glide','Wood Hammer','Fake Out','U-turn'], 'Adamant:208/256/64/0/0/0', [['basculegion',7.7]]],
  ['amoonguss', 9.6, 'Regenerator', 'Rocky Helmet', ['Spore','Rage Powder','Pollen Puff','Protect'], 'Calm:256/0/16/0/256/0', [['kingambit',6.4]]],
  ['incineroar', 9.1, 'Intimidate', 'Safety Goggles', ['Fake Out','Knock Off','Parting Shot','Flare Blitz'], 'Careful:256/32/0/0/224/0', [['rillaboom',5.1]]],
  ['dragonitemega', 8.4, 'Multiscale', 'Dragonitite', ['Extreme Speed','Dragon Claw','Protect','Tailwind'], 'Adamant:64/256/0/0/0/192', [['sinistcha',3.9]]],
  ['gholdengo', 7.8, 'Good as Gold', 'Choice Specs', ['Make It Rain','Shadow Ball','Power Gem','Protect'], 'Modest:128/0/0/256/0/128', [['amoonguss',3.4]]],
  ['ursaluna', 7.2, 'Guts', 'Flame Orb', ['Facade','Headlong Rush','Protect','Trick Room'], 'Adamant:256/256/16/0/0/0', [['sinistcha',4.4]]],
  ['tornadustherian', 6.9, 'Prankster', 'Covert Cloak', ['Bleakwind Storm','Tailwind','Rain Dance','Taunt'], 'Timid:192/0/0/64/0/256', [['basculegion',3.1]]],
  ['glimmora', 6.1, 'Toxic Debris', 'Power Herb', ['Meteor Beam','Sludge Bomb','Earth Power','Spiky Shield'], 'Modest:64/0/0/256/0/192', []],
  ['scizormega', 5.7, 'Technician', 'Scizorite', ['Bullet Punch','Close Combat','U-turn','Protect'], 'Adamant:256/256/16/0/0/0', [['floettemega',2.8]]],
  ['pelipper', 5.2, 'Drizzle', 'Focus Sash', ['Hurricane','Weather Ball','Tailwind','Protect'], 'Modest:32/0/0/256/0/224', [['basculegion',4.9]]],
];

function detail(m) {
  const [id, usage, ability, item, moves, spread, teammates] = m;
  return {
    showdown_id: id,
    showdown_name: id,
    usage_percent: usage,
    abilities: [{ name: ability, percent: 88.4 }, { name: 'Outra', percent: 11.6 }],
    held_items: [{ name: item, percent: 41.2 }, { name: 'Sitrus Berry', percent: 18.7 }],
    moves: moves.map((name, i) => ({ move: name, percent: 92 - i * 11 })),
    teammates: teammates.map(([name, pct]) => ({ pokemon: name, percent: pct })),
    spreads: [{ nature: spread.split(':')[0], spread: spread.split(':')[1], percent: 31.4 }],
  };
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (url.pathname === '/api/stats/Doubles') {
    return res.end(JSON.stringify({
      format: 'Doubles',
      regulation: 'MB',
      folder: 'M5/26_08_2026',
      pokemon: MONS.map((m, i) => ({ ...detail(m), rank: i + 1 })),
    }));
  }

  const battle = /^\/api\/battle\/Doubles\/(.+)$/.exec(url.pathname);
  if (battle) {
    const m = MONS.find((x) => x[0] === battle[1]);
    if (m) return res.end(JSON.stringify({ data: detail(m) }));
    res.statusCode = 404;
    return res.end(JSON.stringify({ error: 'nao encontrado' }));
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'rota desconhecida' }));
});

server.listen(4321, () => console.log('mock api on http://localhost:4321'));
