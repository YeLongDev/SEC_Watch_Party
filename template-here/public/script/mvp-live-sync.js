/* Client-side safety net for the MVP displays.
 * The server already merges the selected MVP with matchdata on every save, but this
 * keeps the OBS display correct even when it is served by an older server process
 * (or when only a matchdata_update arrives).
 */
(function () {
    'use strict';

    function assetPath(value, folder) {
        if (!value) return '';
        const text = String(value).trim();
        if (!text || text === 'idle') return '';
        if (/^(https?:|data:|blob:|\/)/i.test(text)) return text;
        if (text.startsWith('Assets/')) return text;
        if (text.includes('/')) return text;
        return `Assets/${folder}/${text}.png`;
    }

    function resolvePlayer(mvp, matchData) {
        if (!mvp || !matchData || !matchData.teamdata) return null;

        // Preferred lookup: the checkbox id written by postgamecontrol.
        // Accepts mvp-blueteam-3, mvp-redteam-1, plus mvp-blue-0 / mvp-red-0 variants.
        const idMatch = String(mvp.checkboxId || '').match(/^mvp-(blueteam|redteam|blue|red)-(\d+)$/i);
        if (idMatch) {
            const rawTeam = idMatch[1].toLowerCase();
            const teamKey = rawTeam === 'blue' ? 'blueteam' : rawTeam === 'red' ? 'redteam' : rawTeam;
            const index = Number(idMatch[2]);
            const team = matchData.teamdata[teamKey];
            const player = team && Array.isArray(team.playerlist) ? team.playerlist[index] : null;
            if (player) return { player, team, teamKey, index };
        }

        // Fallback: match by nickname, preferring the recorded side.
        const wantedName = String(mvp.nickname || '').trim().toLowerCase();
        if (!wantedName) return null;

        const orderedTeams = mvp.side === 'red'
            ? [{ key: 'redteam' }, { key: 'blueteam' }]
            : [{ key: 'blueteam' }, { key: 'redteam' }];

        for (const teamInfo of orderedTeams) {
            const team = matchData.teamdata[teamInfo.key];
            const players = team && Array.isArray(team.playerlist) ? team.playerlist : [];
            const index = players.findIndex(player =>
                String((player && player.name) || '').trim().toLowerCase() === wantedName
            );
            if (index !== -1) return { player: players[index], team, teamKey: teamInfo.key, index };
        }

        return null;
    }

    function merge(mvp, matchData) {
        const resolved = resolvePlayer(mvp, matchData);
        if (!resolved) return mvp;

        const { player, team, teamKey, index } = resolved;
        const side = teamKey === 'blueteam' ? 'blue' : 'red';
        const playerName = String(player.name || mvp.nickname || 'PLAYER').trim() || 'PLAYER';

        const heroImg = player.hero
            ? assetPath(player.hero, 'HeroPick')
            : 'Assets/HeroPick/idle.png';

        let playerPhoto = (player.photo && String(player.photo).trim())
            ? String(player.photo).trim()
            : (player.name ? `Assets/player/${player.name}.png` : '');
        if (!playerPhoto) playerPhoto = 'Assets/player/playertemp.png';

        const items = Array.from({ length: 6 }, (_, itemIndex) => {
            const value = Array.isArray(player.itemlist) ? player.itemlist[itemIndex] : '';
            const text = value == null ? '' : String(value).trim();
            return (!text || text === 'idle') ? 'idle' : text;
        });

        const spellText = String(player.spell == null ? '' : player.spell).trim();
        const spell = (!spellText || spellText === 'idle') ? '' : spellText;

        return {
            ...mvp,
            checkboxId: `mvp-${teamKey}-${index}`,
            side,
            nickname: playerName,
            teamName: (team && team.teamname) ? team.teamname : (mvp.teamName || (side === 'blue' ? 'BLUE TEAM' : 'RED TEAM')),
            heroImg,
            playerPhoto,
            stats: {
                LVL: String(player.level == null ? '0' : player.level),
                KDA: String(player.KDA == null ? '0/0/0' : player.KDA),
                GOLD: String(player.gold == null ? '0' : player.gold),
                SPELL: spell,
                'ITEM 1': items[0],
                'ITEM 2': items[1],
                'ITEM 3': items[2],
                'ITEM 4': items[3],
                'ITEM 5': items[4],
                'ITEM 6': items[5]
            }
        };
    }

    window.MvpLiveSync = { merge };
})();
