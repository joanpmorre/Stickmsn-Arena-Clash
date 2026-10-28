// Stickman: Arena Clash - game logic

const MAX_LEVEL = 10; // total number of levels
const THEME_OF_LEVEL = [0, 0, 1, 1, 2, 2, 3, 3, 4, 5]; // arena, city, forest, volcano, dark, final
const screens = {};
document.querySelectorAll(".screen").forEach(s => screens[s.id] = s);
const levels = ["Training Arena", "Training Arena", "City", "City", "Forest", "Forest", "Volcano", "Volcano", "Dark Dimension", "Final Arena"];
const enemies = ["Basic Stickman", "Fast Stickman", "Heavy Stickman", "Ninja Stickman", "Ninja Master", "Fire Stickman", "Teleport Stickman", "Fire Lord", "Shadow King", "Final Boss"];
/* ---------- SAVE DATA ---------- */
const save = {
    get(k, d) { try {
        const v = localStorage.getItem(k);
        return v === null ? d : v;
    }
    catch (e) {
        return d;
    } },
    set(k, v) { try {
        localStorage.setItem(k, v);
    }
    catch (e) { } }
};
// highest level the player is allowed to play (level 1 always open)
function unlocked() { return Math.min(MAX_LEVEL, Math.max(1, Number(save.get("sacMax", 1)))); }
// highest level the player has actually beaten
function cleared() { return Math.min(MAX_LEVEL, Math.max(0, Number(save.get("sacCleared", 0)))); }
// Difficulty rating: level 1..10 maps to 3..30 so enemies ramp up steeply
const diff = () => (endless ? Math.min(20, level + Math.floor(wave / 2)) : level) * 3;
let level = Math.min(unlocked(), MAX_LEVEL), php = 100, ehp = 100, combo = 0, maxCombo = 0, playerX = 12, paused = false, active = false, time = 60, versus = false, training = false, endless = false, timer = null;
let specialCD = 0, ultimateCD = 0;
const $ = s => document.querySelector(s);
function show(id) { Object.values(screens).forEach(s => s.classList.add("hidden")); screens[id].classList.remove("hidden"); }

/* ---------- ONLINE 1v1 (PeerJS data connection) ---------- */
let onlineMode = false, onlineRole = "", onlinePeer = null, onlineConn = null, onlineStarting = false;
function onlineStatus(msg) { const el = document.querySelector("#onlineStatus"); if (el) el.textContent = msg; }
function sendOnline(data) { try { if (onlineConn && onlineConn.open) onlineConn.send(data); } catch (e) {} }
function resetOnline() {
    try { if (onlineConn) onlineConn.close(); } catch(e) {}
    try { if (onlinePeer) onlinePeer.destroy(); } catch(e) {}
    onlineConn = null; onlinePeer = null; onlineMode = false; onlineRole = ""; onlineStarting = false;
    document.querySelector("#myRoomWrap").hidden = true;
}
function beginOnlineMatch(role) {
    if (onlineStarting) return;
    onlineStarting = true; onlineMode = true; onlineRole = role;
    versus = true; training = false; endless = false; level = 1;
    startGame(1);
    P1.x = 18; P2.x = 82; P1.hp = 100; P2.hp = 100;
    P1.el.style.left = P1.x + "%"; P2.el.style.left = P2.x + "%";
    P2.el.style.display = "block";
    $("#game").classList.toggle("online-p1", role === "host");
    $("#game").classList.toggle("online-p2", role === "guest");
    $("#enemyLabel").textContent = role === "host" ? "OPPONENT" : "YOU";
    $("#sceneTitle").textContent = "ONLINE DUEL";
    $("#clock").textContent = "ONLINE";
    onlineStatus("Connected. Fight!");
    banner("ONLINE 1V1 — FIGHT!", "#7deaff", 1800);
}
function setupOnlineConnection(conn, role) {
    onlineConn = conn;
    conn.on("open", () => {
        onlineStatus("Connected! Loading match...");
        if (role === "host") conn.send({type:"start"});
        beginOnlineMatch(role);
    });
    conn.on("data", msg => {
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "start" && role === "guest") beginOnlineMatch("guest");
        if (msg.type === "input") {
            const prefix = msg.player === 1 ? "p1" : "p2";
            const key = prefix + ":" + msg.key;
            if (msg.player === 1) {
                if (msg.key === "left") hold.a = !!msg.down;
                if (msg.key === "right") hold.d = !!msg.down;
                if (msg.key === "block") setBlock(P1, !!msg.down);
            } else {
                if (msg.key === "left") hold.l = !!msg.down;
                if (msg.key === "right") hold.r = !!msg.down;
                if (msg.key === "block") setBlock(P2, !!msg.down);
            }
        }
        if (msg.type === "act") {
            const fighter = msg.player === 1 ? P1 : P2;
            if (msg.action === "jump") jumpFor(fighter);
            else if (msg.action === "punch" || msg.action === "kick" || msg.action === "heavy" || msg.action === "special" || msg.action === "ultimate") vsAttack(fighter, msg.action);
        }
        if (msg.type === "leave") {
            onlineStatus("Your opponent disconnected.");
            if (active) { active = false; end(true); $("#modalTitle").textContent = "OPPONENT LEFT"; $("#modalText").textContent = "Your opponent disconnected."; }
        }
    });
    conn.on("close", () => { if (onlineMode && active) { onlineStatus("Connection lost."); banner("CONNECTION LOST", "#ff5577", 2200); } });
    conn.on("error", () => onlineStatus("Connection problem. Check the room ID and internet connection."));
}
document.querySelector("#createRoom").onclick = () => {
    resetOnline();
    if (!window.Peer) { onlineStatus("Could not load online networking. Check your internet connection."); return; }
    onlineStatus("Creating room...");
    onlinePeer = new Peer();
    onlinePeer.on("open", id => {
        document.querySelector("#myRoomWrap").hidden = false;
        document.querySelector("#myRoomCode").textContent = id;
        onlineStatus("Room ready. Keep this page open and share the room ID.");
    });
    onlinePeer.on("connection", conn => {
        if (onlineConn) { conn.close(); return; }
        setupOnlineConnection(conn, "host");
        onlineStatus("Friend found. Connecting...");
    });
    onlinePeer.on("error", e => onlineStatus("Room error: " + (e.type || "network issue") + ". Try creating a new room."));
};
document.querySelector("#joinRoom").onclick = () => {
    const id = document.querySelector("#joinRoomId").value.trim();
    if (!id) { onlineStatus("Paste your friend's room ID first."); return; }
    resetOnline();
    if (!window.Peer) { onlineStatus("Could not load online networking. Check your internet connection."); return; }
    onlineStatus("Joining room...");
    onlinePeer = new Peer();
    onlinePeer.on("open", () => {
        const conn = onlinePeer.connect(id, { reliable: true });
        setupOnlineConnection(conn, "guest");
    });
    onlinePeer.on("error", e => onlineStatus("Could not join room: " + (e.type || "connection error") + ". Check the ID and try again."));
};
document.querySelector("#copyRoom").onclick = async () => {
    const id = document.querySelector("#myRoomCode").textContent;
    try { await navigator.clipboard.writeText(id); onlineStatus("Room ID copied. Send it to your friend."); }
    catch(e) { onlineStatus("Copy failed. Press and hold the room ID to copy it."); }
};
document.querySelector("#onlineBack").onclick = () => { resetOnline(); show("menu"); };

document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
    const a = b.dataset.go;
    if (a === "levels") {
        level = Math.min(level, unlocked());
        buildLevels();
        show("levels");
    }
    else if (a === "arena") {
        training = false; versus = false; endless = false;
        startGame(unlocked());
    }
    else if (a === "endless") {
        training = false; versus = false; endless = true;
        level = Math.min(unlocked(), MAX_LEVEL);
        startGame(level);
    }
    else if (a === "training") {
        training = true;
        versus = false;
        endless = false;
        startGame(1);
    }
    else if (a === "versus") {
        onlineMode = false;
        onlineRole = "";
        versus = true;
        training = false;
        endless = false;
        startGame(Math.min(level, unlocked()));
    }
    else {
        show(a);
    }
});
document.querySelectorAll(".back").forEach(b => b.onclick = () => show("menu"));
/* ---------- LEVEL SELECT (sequential unlock) ---------- */
function buildLevels() {
    const g = $("#levelsGrid"), open = unlocked(), done = cleared();
    g.className = "level-grid";
    g.innerHTML = "";
    for (let i = 1; i <= MAX_LEVEL; i++) {
        const b = document.createElement("button");
        const locked = i > open;
        b.textContent = locked ? "🔒" : (i <= done ? String(i).padStart(2, "0") + " ✓" : String(i).padStart(2, "0"));
        if (i % 5 === 0)
            b.classList.add("boss");
        if (i <= done)
            b.classList.add("done");
        if (locked) {
            b.disabled = true;
            b.classList.add("locked");
            b.title = "Beat level " + (i - 1) + " to unlock";
        }
        b.onclick = () => { level = i; g.querySelectorAll("button").forEach(x => x.classList.remove("selected")); b.classList.add("selected"); updatePreview(); };
        if (i === level)
            b.classList.add("selected");
        g.appendChild(b);
    }
    updatePreview();
}
function updatePreview() {
    $("#previewTitle").textContent = "LEVEL " + String(level).padStart(2, "0");
    $("#previewInfo").textContent = enemies[level - 1] + " • " + levels[level - 1] + (level % 5 === 0 ? " • BOSS" : "") + " • " + (level <= cleared() ? "Cleared" : "Not cleared");
}
$("#startLevel").onclick = () => { training = false; versus = false; startGame(level); };
/* ---------- GAME ---------- */
function tryLandscapeLock() {
    // Supported browsers usually allow orientation lock after entering fullscreen.
    if (screen.orientation && typeof screen.orientation.lock === "function") {
        screen.orientation.lock("landscape").catch(() => {});
    }
}
function startGame(lv) {
    tryLandscapeLock();
    if (lv)
        level = lv;
    show("game");
    $("#game").classList.remove("online-p1", "online-p2");
    clearInterval(timer);
    php = 100;
    ehp = 100;
    combo = 0;
    maxCombo = 0;
    time = 60;
    playerX = 12;
    paused = false;
    active = false;
    specialCD = 0;
    ultimateCD = 0;
    $("#pause").textContent = "Ⅱ";
    updateCooldowns();
    $("#lv").textContent = training ? "TR" : String(level).padStart(2, "0");
    $("#clock").textContent = training ? "∞" : time;
    $("#sceneTitle").textContent = levels[level - 1].toUpperCase();
    $("#enemyLabel").textContent = versus ? "PLAYER 2" : training ? "DUMMY" : enemies[level - 1].toUpperCase();
    $("#combo").textContent = "";
    $("#player").style.left = playerX + "%";
    const en = $("#enemy");
    en.style.display = versus ? "block" : "none";
    en.className = "fighter red";
    void en.offsetWidth;
    en.className = "fighter red enemy-enter";
    const boss = level % 5 === 0 && !training && !versus;
    $("#warning").style.display = boss || training ? "none" : "block";
    $("#bossWarning").style.display = boss ? "block" : "none";
    updateHP();
    setTimeout(() => { active = true; $("#warning").style.display = "none"; $("#bossWarning").style.display = "none"; }, 2400);
    timer = setInterval(() => {
        if (paused || !active)
            return;
        tickCooldowns();
        if (training)
            return;
        time--;
        $("#clock").textContent = time;
        if (time <= 0)
            end(false);
    }, 1000);
}
function updateHP() { $("#php").style.width = php + "%"; $("#ehp").style.width = ehp + "%"; }
function particles(x, y, type = "normal") { let n = type === "ultimate" ? 22 : type === "heavy" ? 14 : 8; for (let i = 0; i < n; i++) {
    let p = document.createElement("i");
    p.className = "particle";
    p.style.left = x + "%";
    p.style.top = y + "%";
    p.style.color = type === "ultimate" ? "#ff3158" : type === "special" ? "#a96cff" : "#45d8ff";
    p.style.background = "currentColor";
    p.style.setProperty("--dx", (Math.random() * 180 - 90) + "px");
    p.style.setProperty("--dy", (Math.random() * 140 - 70) + "px");
    $("#particles").appendChild(p);
    setTimeout(() => p.remove(), 600);
} }
function floatText(text, x, y) { let f = document.createElement("span"); f.className = "float"; f.textContent = text; f.style.left = x + "%"; f.style.top = y + "%"; $("#floaters").appendChild(f); setTimeout(() => f.remove(), 750); }
function skillTitle(name, color) { const el = $("#skillName"); el.textContent = name; el.style.color = color; el.classList.remove("skill-pop"); void el.offsetWidth; el.classList.add("skill-pop"); }
function fx(cls, left, top, ms) { const e = document.createElement("div"); e.className = cls; e.style.left = left + "%"; e.style.top = top + "%"; $("#particles").appendChild(e); setTimeout(() => e.remove(), ms); }
function effectShockwave() { skillTitle("SHOCKWAVE", "#5bd8ff"); fx("shockwave", playerX + 7, 48, 700); particles(playerX + 8, 50, "special"); }
function effectMeteor() { skillTitle("METEOR PUNCH", "#ff9f2e"); fx("meteor", 72, 18, 750); particles(72, 55, "ultimate"); }
function effectSlash() { skillTitle("ENERGY SLASH", "#d56cff"); fx("slash", playerX + 7, 47, 450); }
function effectAura() { fx("aura-burst", playerX + 4, 52, 850); }
function updateCooldowns() {
    $("#cdSpecial").textContent = specialCD > 0 ? specialCD + "s" : "READY";
    $("#cdUltimate").textContent = ultimateCD > 0 ? ultimateCD + "s" : "READY";
    $("#cdSpecial").parentElement.classList.toggle("ready", specialCD <= 0);
    $("#cdUltimate").parentElement.classList.toggle("ready", ultimateCD <= 0);
}
function tickCooldowns() { if (specialCD > 0)
    specialCD--; if (ultimateCD > 0)
    ultimateCD--; updateCooldowns(); }
function attack(type) {
    if (paused || !active)
        return;
    if (type === "special" && specialCD > 0) {
        skillTitle("COOLDOWN", "#ffca4a");
        return;
    }
    if (type === "ultimate" && ultimateCD > 0) {
        skillTitle("ULTIMATE COOLDOWN", "#ffca4a");
        return;
    }
    const data = { punch: [8, "attack"], kick: [10, "kick"], heavy: [16, "heavy"], special: [28, "heavy"], ultimate: [48, "heavy"] }[type];
    if (!data)
        return;
    if (type === "special") {
        specialCD = 7;
        effectShockwave();
        stunUntil = Date.now() + 1800;
        floatText("STUNNED", 72, 34);
    }
    if (type === "ultimate") {
        ultimateCD = 15;
        effectMeteor();
        effectAura();
        rage = 6;
        $("#player").classList.add("raging");
    }
    if (type === "heavy")
        effectSlash();
    let dmg = data[0];
    combo++;
    dmg = Math.round(dmg * (1 + Math.min(combo, 10) * 0.05) * (rage > 0 ? 1.5 : 1));
    if (Math.random() < 0.15) {
        dmg *= 2;
        skillTitle("CRITICAL!", "#ffd23f");
    }
    maxCombo = Math.max(maxCombo, combo);
    ehp = training ? Math.max(1, ehp - dmg) : Math.max(0, ehp - dmg);
    if (training && ehp <= 1)
        setTimeout(() => { ehp = 100; updateHP(); }, 600);
    updateHP();
    const p = $("#player");
    p.classList.remove("attack", "kick", "heavy", "dash");
    void p.offsetWidth;
    p.classList.add(data[1]);
    particles(73, 52, type);
    floatText("-" + dmg, 72, 43);
    $("#combo").textContent = combo > 1 ? "COMBO x" + combo : "";
    if (maxCombo >= 10)
        save.set("sacCombo", 1);
    if (ehp <= 0) {
        setTimeout(() => end(true), 300);
        return;
    }
}
function enemyAttack() {
    if (paused || !active)
        return;
    // enemies hit harder the further you progress; bosses hit harder still
    const base = (level % 5 === 0 ? 9 : 5) + level * 0.18;
    const dmg = Math.round(base + Math.random() * 5);
    php = Math.max(0, php - dmg);
    combo = 0;
    $("#combo").textContent = "";
    updateHP();
    $("#player").classList.add("hurt");
    particles(playerX + 4, 52, "normal");
    floatText("-" + dmg, playerX + 4, 43);
    setTimeout(() => $("#player").classList.remove("hurt"), 220);
    if (php <= 0)
        end(false);
}
function move(v) { if (paused || !active)
    return; playerX = Math.max(4, Math.min(48, playerX + v)); $("#player").style.left = playerX + "%"; }
function jump() { if (paused || !active)
    return; $("#player").classList.add("jump"); setTimeout(() => $("#player").classList.remove("jump"), 430); }
function dash() { if (paused || !active)
    return; playerX = Math.min(55, playerX + 8); $("#player").style.left = playerX + "%"; $("#player").classList.add("dash"); particles(playerX, 52, "special"); setTimeout(() => $("#player").classList.remove("dash"), 220); }
document.querySelectorAll("[data-atk]").forEach(b => b.onclick = () => attack(b.dataset.atk));
document.querySelectorAll("[data-move]").forEach(b => b.onclick = () => move(Number(b.dataset.move) * 4));
{ const j = document.querySelector("[data-jump]"); if (j) j.onclick = jump; }
document.addEventListener("keydown", e => {
    if (screens.game.classList.contains("hidden"))
        return;
    const k = e.key.toLowerCase();
    if (k === "a")
        move(-4);
    if (k === "d")
        move(4);
    if (k === "w")
        jump();
    if (k === "j")
        attack("punch");
    if (k === "k")
        attack("kick");
    if (k === "l")
        attack("heavy");
    if (k === "shift")
        dash();
    if (k === " " || k === "q") {
        e.preventDefault();
        attack("special");
    }
    if (k === "u" || k === "e")
        attack("ultimate");
});
$("#pause").onclick = () => { paused = !paused; $("#pause").textContent = paused ? "▶" : "Ⅱ"; };
$("#exit").onclick = () => { if (onlineMode) sendOnline({type:"leave"}); clearInterval(timer); active = false; if (onlineMode) resetOnline(); show(training || versus ? "menu" : "levels"); if (!training && !versus)
    buildLevels(); };
/* ---------- END OF FIGHT / UNLOCK NEXT LEVEL ---------- */
let lastWin = false;
function end(win) {
    if (!active)
        return;
    if (!win) {
        const fallen = document.querySelector("#player");
        if (fallen) {
            fallen.classList.remove("walk", "attack", "kick", "heavy", "dash", "jump", "hurt", "lunge", "blocking", "raging");
            fallen.classList.add("dead-pose");
        }
    }
    active = false;
    clearInterval(timer);
    lastWin = win;
    const next = $("#next");
    if (win && endless) {
        // Endless mode is survival: no level completion or unlock screen.
        $("#modalTitle").textContent = "SURVIVED!";
        $("#modalText").textContent = "";
        next.textContent = "REPLAY";
    }
    else if (win && !training && !versus) {
        // mark this level cleared, and unlock the next one
        if (level > cleared())
            save.set("sacCleared", level);
        if (level >= unlocked())
            save.set("sacMax", Math.min(MAX_LEVEL, level + 1));
        if (level % 5 === 0)
            save.set("sacBoss", 1);
        if (level === MAX_LEVEL)
            save.set("sacChamp", 1);
        if (level === 1)
            save.set("sacFirst", 1);
        $("#modalTitle").textContent = "VICTORY!";
        $("#modalText").textContent = "";
        next.textContent = level === MAX_LEVEL ? "REPLAY" : "NEXT LEVEL";
    }
    else if (win) {
        $("#modalTitle").textContent = "VICTORY!";
        $("#modalText").textContent = "";
        next.textContent = versus ? "REMATCH" : "REPLAY";
    }
    else {
        $("#modalTitle").textContent = "DEFEAT";
        $("#modalText").textContent = "";
        next.textContent = "REPLAY";
    }
    $("#modal").classList.remove("hidden");
}
$("#next").onclick = () => {
    $("#modal").classList.add("hidden");
    if (lastWin && !training && !versus && level < MAX_LEVEL) {
        level++;
        startGame(level);
    } // continue to the next unlocked level
    else {
        startGame(level);
    } // replay the current level, training round, or versus match
};
$("#menuBtn").onclick = () => {
    $("#modal").classList.add("hidden");
    active = false;
    clearInterval(timer);
    show("menu");
};
/* ---------- CHARACTER (saved) ---------- */
const styles = ["Classic", "Ninja", "Warrior", "Shadow", "Cyber", "Champion"], colors = ["#20bfff", "#ff3158", "#a66cff", "#ffd23f", "#31e37b", "#fff"], auras = ["#20bfff", "#ff3158", "#a66cff", "#ffd23f"];
let chosenGlow = save.get("sacGlow", "#20bfff");
function applyGlow(c) { chosenGlow = c; $("#customFighter").style.setProperty("--glow", c); $("#player").style.setProperty("--glow", c); }
styles.forEach((x, i) => { const b = document.createElement("button"); b.textContent = x; if (i === 0)
    b.className = "active"; b.onclick = () => { document.querySelectorAll("#styles button").forEach(z => z.classList.remove("active")); b.classList.add("active"); }; $("#styles").appendChild(b); });
colors.forEach(c => { const b = document.createElement("button"); b.style.background = c; b.onclick = () => applyGlow(c); $("#colors").appendChild(b); });
auras.forEach(c => { const b = document.createElement("button"); b.textContent = "●"; b.style.color = c; b.onclick = () => applyGlow(c); $("#auras").appendChild(b); });
applyGlow(chosenGlow);
$("#saveChar").onclick = () => { save.set("sacGlow", chosenGlow); $("#saveChar").textContent = "SAVED ✓"; setTimeout(() => $("#saveChar").textContent = "SAVE CHARACTER", 1200); };
let rage = 0, stunUntil = 0, blocking = false, aiTimer = null;
const themes = ["arena", "city", "forest", "volcano", "dark", "final"];
function skin(el, n) { el.dataset.style = String(n).toLowerCase(); }
function enemyClass(n) { let c = ""; if (/Heavy|Destroyer|Guard/.test(n))
    c += " big"; if (/Fast|Teleport/.test(n))
    c += " small"; if (/Ninja|Shadow/.test(n))
    c += " ninja"; if (/Fire/.test(n))
    c += " fire"; if (/Boss|King|Lord|Champion|Master/.test(n))
    c += " boss big"; return c; }
const _sg = startGame;
startGame = function (lv) {
    _sg(lv);
    time = 60 + Math.floor(diff() * 1.5);
    if (!training)
        $("#clock").textContent = time;
    clearInterval(aiTimer);
    rage = 0;
    stunUntil = 0;
    blocking = false;
    const p = $("#player");
    p.classList.remove("raging", "blocking");
    skin(p, save.get("sacStyle", "Classic"));
    $("#arena").className = "arena t-" + themes[training ? 0 : THEME_OF_LEVEL[level - 1]];
    const en = $("#enemy");
    en.style.left = "";
    enemyX = 72;
    lastAtk = 0;
    en.className = "fighter red enemy-enter" + enemyClass(enemies[level - 1]);
    setTimeout(() => { en.style.left = "72%"; en.classList.remove("enemy-enter"); }, 2400);
    aiTimer = setInterval(aiTick, 450);
};
function aiTick() {
    if (paused || !active || training || Date.now() < stunUntil)
        return;
    const en = $("#enemy");
    en.classList.add("lunge");
    setTimeout(() => en.classList.remove("lunge"), 260);
    setTimeout(enemyAttack, 180);
}
function enemyAttack() {
    if (paused || !active)
        return;
    if ($("#player").classList.contains("jump")) {
        floatText("DODGE!", playerX + 4, 38);
        return;
    }
    let dmg = Math.round((level % 5 === 0 ? 9 : 5) + level * 0.18 + Math.random() * 5);
    if (blocking) {
        dmg = Math.round(dmg * 0.3);
        floatText("BLOCK", playerX + 4, 38);
    }
    else {
        combo = 0;
        $("#combo").textContent = "";
    }
    php = Math.max(0, php - dmg);
    updateHP();
    $("#player").classList.add("hurt");
    particles(playerX + 4, 52, "normal");
    floatText("-" + dmg, playerX + 4, 43);
    setTimeout(() => $("#player").classList.remove("hurt"), 220);
    if (php <= 0)
        end(false);
}
const _tc = tickCooldowns;
tickCooldowns = function () { _tc(); if (rage > 0 && --rage <= 0)
    $("#player").classList.remove("raging"); };
const _end = end;
end = function (w) { clearInterval(aiTimer); _end(w); };
const _pt = particles;
particles = function (x, y, t = "normal") { _pt(x, y, t); if (t !== "normal" && t !== "punch" && t !== "kick") {
    const a = $("#arena");
    a.classList.remove("shake");
    void a.offsetWidth;
    a.classList.add("shake");
} };
document.addEventListener("keydown", e => { if (e.key.toLowerCase() === "s" && active && !paused) {
    blocking = true;
    $("#player").classList.add("blocking");
} });
document.addEventListener("keyup", e => { if (e.key.toLowerCase() === "s") {
    blocking = false;
    $("#player").classList.remove("blocking");
} });
skin($("#customFighter"), save.get("sacStyle", "Classic"));
document.querySelectorAll("#styles button").forEach(b => b.addEventListener("click", () => { skin($("#customFighter"), b.textContent); skin($("#player"), b.textContent); save.set("sacStyle", b.textContent); }));
let enemyX = 72, lastAtk = 0;
function pose(el, p, ms) { el.dataset.pose = p; clearTimeout(el._pt); el._pt = setTimeout(() => { delete el.dataset.pose; }, ms); }
function walk(el) { el.classList.add("walk"); clearTimeout(el._wt); el._wt = setTimeout(() => el.classList.remove("walk"), 260); }
function move(v) { if (paused || !active)
    return; playerX = Math.max(4, Math.min(enemyX - 11, playerX + v)); $("#player").style.left = playerX + "%"; walk($("#player")); }
function dash() { if (paused || !active)
    return; playerX = Math.min(enemyX - 11, playerX + 10); const p = $("#player"); p.style.left = playerX + "%"; p.classList.add("dash"); walk(p); particles(playerX, 52, "special"); setTimeout(() => p.classList.remove("dash"), 220); }
function effectMeteor() { skillTitle("METEOR PUNCH", "#ff9f2e"); fx("meteor", enemyX, 18, 750); particles(enemyX, 55, "ultimate"); }
function hitEnemy(type) {
    const en = $("#enemy");
    en.classList.remove("hit");
    void en.offsetWidth;
    en.classList.add("hit");
    setTimeout(() => en.classList.remove("hit"), 180);
    enemyX = Math.min(92, enemyX + ({ heavy: 7, kick: 5, special: 9, ultimate: 12 }[type] || 3));
    en.style.left = enemyX + "%";
    if (training)
        setTimeout(() => { enemyX = Math.max(playerX + 14, 60); en.style.left = enemyX + "%"; }, 500);
}
function attack(type) {
    if (paused || !active)
        return;
    if (type === "special" && specialCD > 0) {
        skillTitle("COOLDOWN", "#ffca4a");
        return;
    }
    if (type === "ultimate" && ultimateCD > 0) {
        skillTitle("ULTIMATE COOLDOWN", "#ffca4a");
        return;
    }
    const data = { punch: [8, "attack"], kick: [10, "kick"], heavy: [16, "heavy"], special: [28, "heavy"], ultimate: [48, "heavy"] }[type];
    if (!data)
        return;
    const p = $("#player");
    p.classList.remove("attack", "kick", "heavy", "dash");
    void p.offsetWidth;
    p.classList.add(data[1]);
    pose(p, type === "kick" ? "kick" : "punch", 260);
    if (type === "special") {
        specialCD = Math.max(2, Math.round(7 - upg().en * .5));
        effectShockwave();
        stunUntil = Date.now() + 1800;
        floatText("STUNNED", enemyX, 34);
    }
    if (type === "ultimate") {
        ultimateCD = Math.max(5, Math.round(15 - upg().en));
        effectMeteor();
        effectAura();
        rage = 6;
        p.classList.add("raging");
    }
    if (type === "heavy")
        effectSlash();
    const reach = { punch: 17, kick: 20, heavy: 22 }[type];
    if (reach && enemyX - playerX > reach) {
        combo = 0;
        $("#combo").textContent = "";
        floatText("MISS", playerX + 8, 40);
        return;
    }
    if (!training && reach && Math.random() < Math.min(.3, diff() * .01)) {
        floatText("DODGE", enemyX, 40);
        combo = 0;
        $("#combo").textContent = "";
        return;
    }
    let dmg = data[0];
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    dmg = Math.round(dmg * (1 + Math.min(combo, 10) * 0.05) * (rage > 0 ? 1.5 : 1) * (1 + upg().str * .1));
    if (Math.random() < 0.15) {
        dmg *= 2;
        skillTitle("CRITICAL!", "#ffd23f");
    }
    ehp = training ? Math.max(1, ehp - dmg) : Math.max(0, ehp - dmg / ((1 + diff() * 0.05) * (level % 5 === 0 ? 1.4 : 1)));
    if (training && ehp <= 1)
        setTimeout(() => { ehp = 100; updateHP(); }, 600);
    updateHP();
    hitEnemy(type);
    particles(enemyX + 1, 52, type);
    floatText("-" + dmg, enemyX, 43);
    $("#combo").textContent = combo > 1 ? "COMBO x" + combo : "";
    if (maxCombo >= 10)
        save.set("sacCombo", 1);
    if (ehp <= 0)
        setTimeout(() => end(true), 300);
}
function aiTick() {
    if (paused || !active || training || Date.now() < stunUntil)
        return;
    const en = $("#enemy");
    if (enemyX - playerX > 16) {
        enemyX = Math.max(playerX + 14, enemyX - (6 + diff() * 0.15));
        en.style.left = enemyX + "%";
        walk(en);
        return;
    }
    if (Date.now() - lastAtk < Math.max(450, 1400 - diff() * 32))
        return;
    lastAtk = Date.now();
    pose(en, "punch", 260);
    en.classList.add("lunge");
    setTimeout(() => en.classList.remove("lunge"), 260);
    setTimeout(enemyAttack, 180);
    if (diff() > 12 && Math.random() < (diff() - 12) * 0.02)
        setTimeout(enemyAttack, 420);
}
function enemyAttack() {
    if (paused || !active)
        return;
    const p = $("#player");
    if (enemyX - playerX > 20) {
        floatText("MISS", enemyX, 40);
        return;
    }
    if (p.classList.contains("jump")) {
        floatText("DODGE!", playerX + 4, 38);
        return;
    }
    let dmg = Math.round((level % 5 === 0 ? 9 : 5) + diff() * 0.6 + Math.random() * (4 + diff() * 0.1));
    dmg = Math.max(1, Math.round(dmg * (1 - upg().hp * .09)));
    if (blocking) {
        dmg = Math.round(dmg * 0.3);
        floatText("BLOCK", playerX + 4, 38);
    }
    else {
        combo = 0;
        $("#combo").textContent = "";
        playerX = Math.max(4, playerX - 3);
        p.style.left = playerX + "%";
    }
    php = Math.max(0, php - dmg);
    updateHP();
    p.classList.add("hurt");
    particles(playerX + 4, 52, "normal");
    floatText("-" + dmg, playerX + 4, 43);
    setTimeout(() => p.classList.remove("hurt"), 220);
    if (php <= 0)
        end(false);
}
document.querySelectorAll(".fighter").forEach(f => { f.insertAdjacentHTML("afterbegin", '<i class="cape"></i>'); f.querySelector(".head").innerHTML = '<i class="eye"></i><i class="eye r"></i><i class="mouth"></i>'; });
function spark(x, y, t) { const s = (t === "heavy" || t === "ultimate") ? 130 : 85, e = document.createElement("div"); e.className = "spark"; e.style.cssText = "left:" + x + "%;top:" + y + "%;width:" + s + "px;height:" + s + "px;margin:-" + s / 2 + "px 0 0 -" + s / 2 + "px"; $("#particles").appendChild(e); setTimeout(() => e.remove(), 400); }
const _pt2 = particles;
particles = function (x, y, t = "normal") { _pt2(x, y, t); if (t !== "special")
    spark(x, y - 6, t); };
document.querySelectorAll(".fighter .arm").forEach(a => a.insertAdjacentHTML("beforeend", '<i class="fore"></i>'));
let lastFire = 0, lastTp = 0;
function fireball() {
    pose($("#enemy"), "punch", 260);
    skillTitle("FIREBALL!", "#ff6a2a");
    const f = document.createElement("div");
    f.className = "fireball";
    f.style.left = (enemyX - 2) + "%";
    $("#particles").appendChild(f);
    requestAnimationFrame(() => requestAnimationFrame(() => { f.style.left = (playerX + 4) + "%"; }));
    setTimeout(() => {
        f.remove();
        if (!active)
            return;
        const p = $("#player");
        if (p.classList.contains("jump")) {
            floatText("DODGE!", playerX + 4, 38);
            return;
        }
        let d = Math.round((6 + diff() * 0.5) * (1 - upg().hp * .09));
        if (blocking) {
            d = Math.round(d * .3);
            floatText("BLOCK", playerX + 4, 38);
        }
        php = Math.max(0, php - d);
        updateHP();
        p.classList.add("hurt");
        setTimeout(() => p.classList.remove("hurt"), 220);
        particles(playerX + 4, 52, "normal");
        floatText("-" + d, playerX + 4, 43);
        if (php <= 0)
            end(false);
    }, 900);
}
function blink() {
    const en = $("#enemy");
    skillTitle("TELEPORT!", "#b46cff");
    en.style.opacity = 0;
    setTimeout(() => { if (!active)
        return; enemyX = Math.min(92, playerX + 14); en.style.left = enemyX + "%"; en.style.opacity = ""; spark(enemyX, 50, "normal"); lastAtk = 0; }, 300);
}
const _ai = aiTick;
aiTick = function () {
    if (paused || !active || training || Date.now() < stunUntil)
        return;
    const n = enemies[level - 1] || "";
    if (/Fire/.test(n) && Date.now() - lastFire > 2800 && enemyX - playerX > 18) {
        lastFire = Date.now();
        fireball();
        return;
    }
    if (/Teleport|Shadow/.test(n) && Date.now() - lastTp > 3500 && Math.random() < .5) {
        lastTp = Date.now();
        blink();
        return;
    }
    _ai();
};
const upg = () => ({ str: 0, hp: 0, en: 0 });
/* =====================================================================
   AUDIO v2 - all sounds and music are synthesised (no audio files)
   - sound effects: layered swings, impacts, whooshes, gongs, fanfares, with a touch of reverb
   - music: Japanese (Hirajoshi) scale; slow ambient score on the menu, taiko-driven battle score
     that speeds up for boss waves (window.musicIntensity)
   ===================================================================== */
(function () {
    let ac = null, sfxOn = true, musicOn = true, master, sfxBus, musBus, mTimer = null, step = 0, nextT = 0, lastStep = 0;
    window.musicIntensity = 1;
    const HIRA = [0, 2, 3, 7, 8];                                    // A B C E F
    const freq = (deg, oct) => 55 * Math.pow(2, oct + (HIRA[deg % 5] + 12 * Math.floor(deg / 5)) / 12);

    function impulse(sec, decay) {
        const n = ac.sampleRate * sec | 0, b = ac.createBuffer(2, n, ac.sampleRate);
        for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
        return b;
    }
    function tone(f, d, type, v, t, slide, bus) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + d);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(g); g.connect(bus || sfxBus); o.start(t); o.stop(t + d + 0.03);
    }
    function noise(d, v, t, f0, f1, type, bus) {
        const n = ac.sampleRate * d | 0, buf = ac.createBuffer(1, n, ac.sampleRate), a = buf.getChannelData(0);
        for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1;
        const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
        s.buffer = buf; f.type = type || "highpass"; f.frequency.setValueAtTime(f0 || 800, t);
        if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + d);
        g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
        s.connect(f); f.connect(g); g.connect(bus || sfxBus); s.start(t);
    }
    const whoosh = (t, d, v, a, b) => noise(d, v, t, a, b, "bandpass");
    const boom = (t, v) => { tone(120, 0.5, "sine", v, t, 42); noise(0.12, v * 0.5, t, 400, 100, "lowpass"); };
    const gong = t => { [70, 140, 211, 297].forEach((f, i) => tone(f, 2.2 - i * 0.3, "sine", 0.22 / (i + 1), t)); noise(1.2, 0.08, t, 3000, 800, "bandpass"); };

    window.sfx = function (n, arg) {
        if (!sfxOn || !ac) return;
        const t = ac.currentTime;
        switch (n) {
            case "punch": whoosh(t, 0.13, 0.22, 600, 2400); break;
            case "kick": whoosh(t, 0.17, 0.26, 400, 1800); tone(110, 0.1, "sine", 0.12, t, 60); break;
            case "heavy": whoosh(t, 0.24, 0.34, 250, 1400); tone(90, 0.22, "sawtooth", 0.1, t, 45); break;
            case "special": tone(200, 0.55, "sawtooth", 0.2, t, 1500); whoosh(t, 0.55, 0.28, 500, 3500); break;
            case "ultimate": boom(t, 0.7); tone(70, 1, "sine", 0.4, t, 28); tone(200, 0.7, "sawtooth", 0.14, t, 2000); noise(0.9, 0.35, t, 2500, 300, "bandpass"); break;
            case "hit": { const k = { heavy: 1.4, kick: 1.15, special: 1.5, ultimate: 1.9 }[arg] || 1;
                tone(160, 0.12, "sine", 0.35 * k, t, 48); noise(0.07, 0.3 * k, t, 900, 300, "highpass"); tone(1300, 0.09, "triangle", 0.07 * k, t, 800); break; }
            case "hurt": tone(250, 0.28, "sawtooth", 0.22, t, 70); noise(0.12, 0.25, t, 700, 200, "highpass"); break;
            case "block": tone(1500, 0.18, "triangle", 0.16, t, 1400); tone(2300, 0.14, "square", 0.05, t); noise(0.05, 0.18, t, 3500); break;
            case "jump": tone(230, 0.16, "sine", 0.2, t, 560); break;
            case "dash": whoosh(t, 0.22, 0.32, 500, 3200); break;
            case "step": { if (performance.now() - lastStep < 110) return; lastStep = performance.now();
                const v = 0.07 * (arg || 1); tone(95, 0.09, "sine", v, t, 55); noise(0.03, v * 0.6, t, 2500); break; }
            case "fire": whoosh(t, 0.55, 0.25, 300, 1600); tone(200, 0.45, "sawtooth", 0.14, t, 650); break;
            case "tp": tone(1300, 0.32, "sine", 0.22, t, 200); tone(300, 0.28, "triangle", 0.15, t + 0.12, 1500); break;
            case "click": tone(880, 0.05, "square", 0.09, t); tone(1320, 0.07, "triangle", 0.06, t + 0.02); break;
            case "combo": tone(freq((arg || 1) % 5, 3 + Math.floor((arg || 1) / 5) % 2), 0.2, "triangle", 0.1, t); break;
            case "death": tone(320, 0.4, "sawtooth", 0.16, t, 55); noise(0.18, 0.2, t, 1200, 300, "highpass"); break;
            case "wave": boom(t, 0.5); boom(t + 0.2, 0.4); break;
            case "boss": gong(t); boom(t + 0.1, 0.7); tone(55, 1.6, "sawtooth", 0.1, t, 40); break;
            case "rage": boom(t, 0.6); tone(100, 0.9, "sawtooth", 0.2, t, 1000); whoosh(t, 0.9, 0.3, 300, 3000); break;
            case "win": [0, 1, 2, 4, 5, 7].forEach((d, i) => { tone(freq(d, 3), 0.5, "triangle", 0.16, t + i * 0.13); tone(freq(d, 4), 0.4, "square", 0.05, t + i * 0.13); }); gong(t + 0.8); break;
            case "ach": [0, 2, 4].forEach((d, i) => tone(freq(d, 4), 0.25, "triangle", 0.14, t + i * 0.08)); break;
            case "lose": [4, 3, 2, 0].forEach((d, i) => tone(freq(d, 2), 0.7, "sawtooth", 0.14, t + i * 0.25, freq(d, 2) * 0.96)); boom(t + 0.9, 0.5); break;
        }
    };

    /* ---------- music ---------- */
    function pluck(f, t, v, bus) { tone(f, 0.5, "triangle", v, t, f * 0.985, bus); tone(f * 2, 0.2, "sine", v * 0.35, t, undefined, bus); }
    function lead(f, d, t) {                                          // breathy flute with vibrato
        const o = ac.createOscillator(), l = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
        o.type = "sine"; o.frequency.value = f; l.frequency.value = 5.2; lg.gain.value = f * 0.012; l.connect(lg); lg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.18); g.gain.exponentialRampToValueAtTime(0.001, t + d);
        o.connect(g); g.connect(musBus); o.start(t); l.start(t); o.stop(t + d + 0.05); l.stop(t + d + 0.05);
        noise(d, 0.015, t, 2200, 1500, "bandpass", musBus);
    }
    const rnd = n => (((n * 2654435761) >>> 0) % 1000) / 1000;
    const PROG = [0, 3, 2, 4];                                        // chord roots, one per bar
    function sched() {
        if (!ac || !musicOn) return;
        const battle = !screens.game.classList.contains("hidden"), inten = window.musicIntensity || 1;
        const sp = battle ? (inten >= 2 ? 0.1 : inten > 1 ? 0.108 : 0.118) : 0.3;
        while (nextT < ac.currentTime + 0.3) {
            const s = step % 16, bar = (step >> 4) % 4, root = PROG[bar], r = rnd(step + 7), t = nextT;
            if (battle) {
                if (s === 0) boom(t, 0.42); if (s === 8) boom(t, 0.3);
                if (s === 6 || s === 14) tone(150, 0.25, "sine", 0.16, t, 70, musBus);
                if (inten >= 1.5 && (s === 3 || s === 11)) tone(150, 0.2, "sine", 0.14, t, 70, musBus);
                if (s % 2 === 0) noise(0.035, 0.05, t, 7000, 0, "highpass", musBus);
                if (s === 4 || s === 12) noise(0.12, 0.09, t, 4500, 0, "highpass", musBus);
                if ([0, 2, 3, 6, 8, 10, 11, 14].includes(s)) tone(freq(root, 0), sp * 1.6, "sawtooth", 0.07, t, undefined, musBus);
                if (s % 2 === 1 && r > 0.4) pluck(freq(root + Math.floor(r * 9), 2), t, 0.075, musBus);
                if (inten >= 2 && s % 4 === 0) tone(freq(root, 1), sp * 3, "square", 0.03, t, undefined, musBus);
            } else {
                if (s === 0) { tone(freq(root, 0), sp * 15, "sine", 0.2, t, undefined, musBus); tone(freq(root + 2, 1), sp * 15, "triangle", 0.045, t, undefined, musBus); }
                if (s % 4 === 0 && r > 0.35) lead(freq(root + Math.floor(r * 8), 3), sp * 5, t);
                if (s % 2 === 0 && r > 0.55) pluck(freq(root + Math.floor(r * 9), 2), t, 0.06, musBus);
                if (s === 8) noise(sp * 6, 0.025, t, 600, 2500, "bandpass", musBus);
            }
            nextT += sp; step++;
        }
    }
    function setMusic(on) { musicOn = on; if (musBus) musBus.gain.value = on ? 0.5 : 0; if (on && ac) nextT = ac.currentTime + 0.1; }
    function init() {
        if (ac) { if (ac.state === "suspended") ac.resume(); return; }
        try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
        master = ac.createGain(); master.gain.value = 0.6;
        const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
        const conv = ac.createConvolver(); conv.buffer = impulse(1.6, 3);
        const wet = ac.createGain(); wet.gain.value = 0.28; conv.connect(wet); wet.connect(master);
        sfxBus = ac.createGain(); sfxBus.connect(master); sfxBus.connect(conv);
        musBus = ac.createGain(); musBus.gain.value = musicOn ? 0.5 : 0; musBus.connect(master); musBus.connect(conv);
        nextT = ac.currentTime + 0.1; mTimer = setInterval(sched, 100);
    }
    ["pointerdown", "keydown"].forEach(ev => addEventListener(ev, init, { passive: true }));
    document.addEventListener("click", e => { if (e.target.closest("button")) sfx("click"); });
    const sb = document.querySelectorAll(".snd button");
    if (sb[0]) sb[0].addEventListener("click", () => { sfxOn = !sb[0].classList.contains("off"); });
    if (sb[1]) sb[1].addEventListener("click", () => setMusic(!sb[1].classList.contains("off")));
    const si = document.querySelectorAll("#settings input");
    if (si[0]) si[0].addEventListener("change", () => { sfxOn = si[0].checked; });
    if (si[1]) si[1].addEventListener("change", () => setMusic(si[1].checked));
    const endBase = end;
    end = function (w) { const was = active; endBase(w); if (was) { sfx(w ? "win" : "lose"); window.musicIntensity = 1; } };
})();

/* ---------- RESET PROGRESS (tap twice to confirm) ---------- */
(() => {
    const btn = $("#resetProg");
    let armed = null;
    btn.onclick = () => {
        if (!armed) {
            btn.textContent = "TAP AGAIN TO CONFIRM";
            armed = setTimeout(() => { armed = null; btn.textContent = "RESET PROGRESS"; }, 3000);
            return;
        }
        clearTimeout(armed);
        ["sacMax", "sacCleared", "sacLevel", "sacFirst", "sacCombo", "sacBoss", "sacChamp"].forEach(k => {
            try { localStorage.removeItem(k); } catch (e) { }
        });
        location.reload();
    };
})();

/* Give each leg a knee: thigh (.leg) + shin (.shin) */
document.querySelectorAll(".fighter .leg").forEach(l => l.insertAdjacentHTML("beforeend", '<i class="shin"></i>'));

/* =====================================================================
   BATTLE ENGINE v2
   - Enter the Arena: survival waves with several enemies at once + bosses
   - Two Player: Player 1 vs Player 2 on one keyboard, no CPU enemies
   (replaces the older single-enemy start / attack / AI functions above)
   ===================================================================== */
const ATK = { punch: [8, "attack", 13], kick: [10, "kick", 15], heavy: [16, "heavy", 17], special: [28, "heavy", 0], ultimate: [48, "heavy", 0] };
const BOSS_OF = { 5: "Ninja Master", 6: "Heavy Destroyer", 7: "Shadow Lord", 8: "Fire Lord", 9: "Shadow King", 10: "Final Boss" };
const MINIONS = ["Basic Stickman", "Fast Stickman", "Heavy Stickman", "Ninja Stickman", "Fire Stickman", "Teleport Stickman", "Shadow Stickman"];
const wavesOf = L => 3 + Math.floor((L - 1) / 3);              // more waves as levels rise
const perWave = L => Math.min(8, 2 + Math.floor(L / 2));       // larger enemy squads at higher levels
const flagsOf = n => ({ fast: /Fast/.test(n), heavy: /Heavy/.test(n), dodge: /Ninja|Shadow|Final/.test(n), fire: /Fire|Final/.test(n), tp: /Teleport|Shadow|Final/.test(n) });
const keyHint = $(".keyboard"), defaultHint = keyHint.textContent;
const VS_HINT = "P1 (LEFT KEYS): A/D MOVE • W JUMP • S BLOCK • Z PUNCH • X KICK • C HEAVY • V SHOCKWAVE • B METEOR   |   P2 (RIGHT KEYS): ←/→ MOVE • ↑ JUMP • ↓ BLOCK • U PUNCH • I KICK • O HEAVY • P SHOCKWAVE • [ METEOR";
let foes = [], wave = 0, waveMax = 0, pending = 0, session = 0, waveBreak = false;

// Fighters. Player 1 reads/writes the older global variables so the HUD keeps working.
const P1 = { el: $("#player"), dir: 1, pc: true,
    get x() { return playerX; }, set x(v) { playerX = v; },
    get hp() { return php; }, set hp(v) { php = v; },
    get combo() { return combo; }, set combo(v) { combo = v; },
    get rage() { return rage; }, set rage(v) { rage = v; },
    get spec() { return specialCD; }, set spec(v) { specialCD = v; },
    get ult() { return ultimateCD; }, set ult(v) { ultimateCD = v; },
    get block() { return blocking; }, set block(v) { blocking = v; },
    get stun() { return stunUntil; }, set stun(v) { stunUntil = v; } };
const P2 = { el: $("#enemy"), dir: -1, pc: true, x: 78, combo: 0, rage: 0, spec: 0, ult: 0, block: false, stun: 0,
    get hp() { return ehp; }, set hp(v) { ehp = v; } };

function banner(text, color, ms) {
    const w = $("#warning");
    w.textContent = text; w.style.color = color; w.style.display = "block";
    setTimeout(() => { w.style.display = "none"; }, ms);
}
function nearestFoeX() { return foes.reduce((m, f) => f.dead ? m : Math.min(m, f.x), 95); }
function syncHud() {
    if (!versus) {
        if (training) ehp = 100;
        else {
            const al = foes.filter(f => !f.dead);
            ehp = waveMax ? Math.round(100 * al.reduce((s, f) => s + f.hp, 0) / waveMax) : 0;
            const b = al.find(f => f.boss);
            $("#enemyLabel").textContent = b ? b.name.toUpperCase() : "ENEMIES: " + (al.length + pending);
        }
    }
    updateHP();
    foes.forEach(f => { const i = f.el.querySelector(".fhp i"); if (i) i.style.width = Math.max(0, 100 * f.hp / f.max) + "%"; });
}

/* ---------- waves ---------- */
function planWave(i) {
    const L = endless ? Math.min(MAX_LEVEL, Math.max(1, 1 + Math.floor(i / 3))) : level, avail = Math.min(MINIONS.length, 1 + Math.floor(L * 0.7)), list = [];
    for (let k = 0; k < perWave(L); k++) list.push({ name: MINIONS[Math.floor(Math.random() * avail)] });
    if (endless && (i + 1) % 5 === 0 && BOSS_OF[L]) list[0] = { name: BOSS_OF[L], boss: true };
    else if (!endless && i === wavesOf(L) - 1 && BOSS_OF[L]) list[0] = { name: BOSS_OF[L], boss: true };
    list.forEach(d => { const fl = flagsOf(d.name); d.max = Math.round((d.boss ? 170 : 38) * (1 + L * 0.13) * (fl.heavy ? 1.5 : 1) * (fl.fast ? 0.8 : 1)); });
    list.forEach((d, k) => { d.side = ((i + k) % 2 === 0) ? 1 : -1; });   // 1 = enters from the right, -1 = from the left
    return list;
}
function startWave(i) {
    const s = session, list = planWave(i), boss = list.some(d => d.boss);
    wave = i; waveBreak = false; pending = list.length; waveMax = list.reduce((a, d) => a + d.max, 0);
    sfx(boss ? "boss" : "wave"); window.musicIntensity = boss ? 2 : 1;
    banner(boss ? "⚠ BOSS BATTLE ⚠" : "WAVE " + (i + 1), boss ? "#ffd34e" : "#ff3158", 1500);
    $("#clock").textContent = endless ? "WAVE " + (i + 1) + " • ∞" : "WAVE " + (i + 1) + "/" + wavesOf(level);
    list.forEach((d, k) => setTimeout(() => { if (s !== session) return; spawn(d); pending--; syncHud(); }, 650 + k * 320));
    syncHud();
}
function spawn(d) {
    const n = d.name, fl = flagsOf(n), boss = !!d.boss, side = d.side || 1;
    const el = P2.el.cloneNode(true);
    el.removeAttribute("id");
    el.className = "fighter red foe spawning" + enemyClass(n);
    el.style.cssText = "left:" + (side > 0 ? 104 : -12) + "%;display:block";
    el.insertAdjacentHTML("beforeend", '<b class="fhp"><i></i></b>');
    $("#arena").insertBefore(el, $("#particles"));
    const f = { el, foe: true, dir: -1, side, pc: false, name: n, boss, dummy: !!d.dummy, hp: d.max, max: d.max, x: side > 0 ? 90 : 6, combo: 0, rage: 0, stun: 0, block: false,
        speed: fl.fast ? 1.4 : fl.heavy ? 0.7 : 1, dm: fl.fast ? 0.85 : fl.heavy ? 1.3 : 1,
        dmgm: (boss ? 1.35 : 0.92) * (fl.heavy ? 1.35 : 1) * (fl.fast ? 0.95 : 1) * (1 + Math.max(0, (endless ? Math.floor(wave / 2) : level - 1)) * 0.045),
        dodge: fl.dodge, fire: fl.fire, tp: fl.tp,
        lastAtk: Date.now() + 450, lastFire: Date.now() + 1000, lastTp: Date.now() + 1200, lastDash: Date.now() + 2200, skillLock: 0 };
    foes.push(f);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.left = f.x + "%"; }));
    setTimeout(() => el.classList.remove("spawning"), 950);
    if (boss) skillTitle(n.toUpperCase(), "#ffd34e");
    return f;
}
function checkWave() {
    if (foes.some(f => !f.dead) || pending > 0 || waveBreak) return;
    waveBreak = true;
    if (!endless && wave + 1 >= wavesOf(level)) { setTimeout(() => end(true), 600); return; }
    const s = session;
    const heal = level <= 2 ? 12 : 7; php = Math.min(100, php + heal); updateHP(); floatText("+" + heal + " HP", playerX + 4, 38);
    setTimeout(() => { if (s === session && active) startWave(wave + 1); }, 1800);
}
function kill(t) {
    if (versus) { finishVersus(t === P2 ? 1 : 2); return; }
    if (t === P1) { t.el.classList.remove("walk", "attack", "kick", "heavy", "dash", "jump", "hurt", "lunge", "blocking", "raging"); t.el.classList.add("dead-pose"); end(false); return; }
    t.dead = true; t.el.classList.add("dying"); sfx("death"); if (t.boss) unlock("sacBoss");
    setTimeout(() => t.el.remove(), 700);
    syncHud(); checkWave();
}
function finishVersus(w) {
    if (!active) return;
    const loser = w === 1 ? P2.el : P1.el;
    if (loser) {
        loser.classList.remove("walk", "attack", "kick", "heavy", "dash", "jump", "hurt", "lunge", "blocking", "raging");
        loser.classList.add("dead-pose");
    }
    end(true);
    $("#modalTitle").textContent = "PLAYER " + w + " WINS!";
    $("#modalText").textContent = "";
    $("#next").textContent = "REMATCH";
}

/* ---------- combat (shared by the player, Player 2 and enemies) ---------- */
function clampX(t, x) {
    if (t === P1) return Math.max(4, Math.min(x, (versus ? P2.x : 92) - 8));
    return Math.min(versus ? 92 : 95, Math.max(playerX + 8, x));
}
function dealDamage(a, t, type, ranged) {
    let dmg = ATK[type][0] * (1 + Math.min(a.combo, 10) * 0.05) * (a.rage > 0 ? 1.5 : 1) * (a.mult || 1);
    if (!ranged) {
        if (t.dodge && Math.random() < Math.min(0.3, diff() * 0.01)) { floatText("DODGE", t.x, 40); return false; }
        if (!t.foe && t.el.classList.contains("jump")) { floatText("DODGE!", t.x + 4, 38); return false; }
    }
    let crit = false;
    if (Math.random() < 0.15) { crit = true; dmg *= 2; if (a === P1) skillTitle("CRITICAL!", "#ffd23f"); }
    if (t.block && !ranged) { dmg *= 0.3; floatText("BLOCK", t.x + 4, 38); sfx("block"); }
    dmg = Math.max(1, Math.round(dmg));
    t.hp = t.dummy ? Math.max(1, t.hp - dmg) : Math.max(0, t.hp - dmg);
    if (t.dummy && t.hp <= 1) setTimeout(() => { t.hp = t.max; syncHud(); }, 600);
    const el = t.el;
    el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit");
    setTimeout(() => el.classList.remove("hit"), 180);
    if (!t.foe) { if (!t.block) t.combo = 0; el.classList.add("hurt"); setTimeout(() => el.classList.remove("hurt"), 220); }
    t.kv = (t.kv || 0) + a.dir * ({ heavy: 5, kick: 3, special: 9, ultimate: 12 }[type] || 1.5) * 8;   // smooth knockback (decays in the frame loop)
    particles(t.x + 1, 52, type); fx("ring", t.x + 2, 52, 420); floatText("-" + dmg + (crit ? "!" : ""), t.x, 43, crit ? "crit" : ""); sfx("hit", type);
    freezeUntil = Date.now() + ({ ultimate: 140, heavy: 90, special: 70, kick: 55 }[type] || 35);
    syncHud();
    if (t.hp <= 0 && !t.dead) kill(t);
    return true;
}
function doAttack(a, opps, type) {
    const now = Date.now(), d = ATK[type], el = a.el;
    if (type === "special" && a.spec > 0) { if (a === P1) skillTitle("COOLDOWN", "#ffca4a"); return; }
    if (type === "ultimate" && a.ult > 0) { if (a === P1) skillTitle("ULTIMATE COOLDOWN", "#ffca4a"); return; }
    el.classList.remove("attack", "kick", "heavy", "dash", "lunge"); void el.offsetWidth;
    el.classList.add(a.dir > 0 ? d[1] : "lunge");
    pose(el, type === "kick" ? "kick" : "punch", 260); sfx(type);
    if (type === "punch" || type === "kick") fx("slash " + (type === "kick" ? "kk" : "pp") + (a.dir < 0 ? " l" : ""), a.x + 6 * a.dir, type === "kick" ? 60 : 47, 300);
    const up = (a === P1 && !versus) ? upg() : { str: 0, en: 0 };
    a.mult = 1 + up.str * 0.1;
    const live = opps.filter(o => !o.dead).sort((p, q) => Math.abs(p.x - a.x) - Math.abs(q.x - a.x));
    let hit = false;
    if (type === "special") {
        a.spec = Math.max(2, Math.round(7 - up.en * 0.5));
        skillTitle("SHOCKWAVE", "#5bd8ff"); fx(a.dir > 0 ? "shockwave" : "shockwave r", a.x + 7 * a.dir, 48, 700);
        let said = false;
        live.forEach(o => { if (Math.abs(o.x - a.x) <= 45) { o.stun = now + 1800; if (!said) { said = true; floatText("STUNNED", o.x, 34); } hit = dealDamage(a, o, type, true) || hit; } });
    }
    else if (type === "ultimate") {
        a.ult = Math.max(5, Math.round(15 - up.en)); a.rage = 6; el.classList.add("raging");
        skillTitle("METEOR PUNCH", "#ff9f2e"); fx("aura-burst", a.x + 4, 52, 850); screenFlash();
        live.forEach(o => { fx("meteor", o.x, 18, 750); hit = dealDamage(a, o, type, true) || hit; });
    }
    else {
        if (type === "heavy") { skillTitle("ENERGY SLASH", "#d56cff"); fx("slash", a.x + 7 * a.dir, 47, 450); }
        // attack magnetism: if the target is a little out of reach, step in so the hit connects
        const front = live.filter(o => (o.x - a.x) * a.dir > -4)[0];
        if (front) {
            const gap = (front.x - a.x) * a.dir - d[2];
            if (gap > 0 && gap <= 9) {
                a.x = a.dir > 0 ? Math.min(front.x - 8, a.x + gap + 1) : Math.max(front.x + 8, a.x - gap - 1);
                el.style.left = a.x + "%";
            }
        }
        const near = live.filter(o => { const dd = (o.x - a.x) * a.dir; return dd > -4 && dd <= d[2]; }).slice(0, type === "heavy" ? 2 : 1);
        if (!near.length) { a.combo = 0; if (a === P1) $("#combo").textContent = ""; floatText("MISS", a.x + 8 * a.dir, 40); return; }
        near.forEach(o => { hit = dealDamage(a, o, type, false) || hit; });
    }
    if (!hit) { a.combo = 0; if (a === P1) $("#combo").textContent = ""; return; }
    a.combo++;
    if (a === P1) addRage(6);
    recordCombo(a.combo);
    if (a === P1) { maxCombo = Math.max(maxCombo, combo); $("#combo").textContent = combo > 1 ? combo + " HIT COMBO!" : ""; popCombo(); sfx("combo", combo); /* highest combo: see recordCombo() */ }
}

/* ---------- enemy behaviour ---------- */
function hurtP1(f, ranged, fixed) {
    if (!active || f.dead) return;
    if (!ranged && Math.abs(f.x - playerX) > 16) { floatText("MISS", f.x, 40); return; }
    if (P1.el.classList.contains("jump")) { floatText("DODGE!", playerX + 4, 38); sfx("jump"); return; }
    let dmg = fixed || Math.round(((f.boss ? 9 : 5) + diff() * 0.6 + Math.random() * (4 + diff() * 0.1)) * f.dmgm);
    dmg = Math.max(1, Math.round(dmg * (1 - upg().hp * 0.09)));
    if (blocking) { dmg = Math.round(dmg * 0.3); floatText("BLOCK", playerX + 4, 38); sfx("block"); }
    else { combo = 0; $("#combo").textContent = ""; P1.kv = (P1.kv || 0) + (playerX >= f.x ? 24 : -24); sfx("hurt"); }
    php = Math.max(0, php - dmg); updateHP(); addRage(4); tookDamage = true;
    P1.el.classList.add("hurt"); setTimeout(() => P1.el.classList.remove("hurt"), 220);
    particles(playerX + 4, 52, "normal"); floatText("-" + dmg, playerX + 4, 43);
    if (php <= 0) end(false);
}
function foeStrike(f) {
    pose(f.el, "punch", 260); f.el.classList.add("lunge");
    setTimeout(() => f.el.classList.remove("lunge"), 260);
    setTimeout(() => hurtP1(f, false), 180);
}
function foeFireball(f) {
    pose(f.el, "punch", 260); skillTitle("FIREBALL!", "#ff6a2a"); sfx("fire");
    const b = document.createElement("div");
    b.className = "fireball"; b.style.left = (f.x + (f.side > 0 ? -2 : 6)) + "%"; $("#particles").appendChild(b);
    requestAnimationFrame(() => requestAnimationFrame(() => { b.style.left = (playerX + 4) + "%"; }));
    setTimeout(() => { b.remove(); hurtP1(f, true, Math.round((6 + diff() * 0.5) * f.dmgm)); }, 900);
}
function foeBlink(f) {
    sfx("tp"); f.el.style.opacity = 0;
    setTimeout(() => { if (f.dead || !active) return; f.x = Math.max(4, Math.min(92, playerX + f.side * 10)); f.el.style.left = f.x + "%"; f.el.style.opacity = ""; f.lastAtk = 0; }, 300);
}
function aiLoop() {
    if (paused || !active || versus || training) return;
    const now = Date.now();
    foes.filter(f => !f.dead).sort((a, b) => Math.abs(a.x - playerX) - Math.abs(b.x - playerX)).forEach((f, i, all) => {
        if (now < f.stun) return;
        const d = Math.abs(f.x - playerX);
        const rank = all.slice(0, i).filter(o => o.side === f.side).length;   // queue position on its own side
        if (f.fire && now - f.lastFire > 2800 && d > 22) { f.lastFire = now; foeFireball(f); return; }
        if (f.tp && now - f.lastTp > Math.max(1900, 3100 - diff() * 22) && Math.random() < 0.58) { f.lastTp = now; foeBlink(f); return; }
        // Ninja / shadow enemies occasionally phase-dash to the player's other side.
        if (f.dodge && now - f.lastDash > Math.max(2400, 4300 - diff() * 24) && d < 38 && Math.random() < 0.34) {
            f.lastDash = now; f.el.style.opacity = "0.25"; f.el.style.filter = "hue-rotate(70deg) drop-shadow(0 0 12px #b16cff)";
            setTimeout(() => { if (f.dead || !active) return; f.x = Math.max(4, Math.min(92, playerX + (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 5))); f.el.style.left = f.x + "%"; f.el.style.opacity = ""; f.el.style.filter = ""; f.lastAtk = Math.min(f.lastAtk, Date.now() - 300); floatText("PHASE DASH", f.x, 34, "critical"); }, 240);
            return;
        }
        f.want = playerX + f.side * (10 + rank * 7);    // enemies queue up; the frame loop walks them there
        if ((f.x - f.want) * f.side > 2) return;
        // only the two closest enemies attack at once
        if (i < Math.min(4, 1 + Math.floor((endless ? Math.min(20, level + Math.floor(wave / 2)) : level) / 3)) && d <= 16 && now - f.lastAtk > Math.max(380, 1180 - diff() * 24) * f.dm * (0.82 + Math.random() * 0.36)) { f.lastAtk = now; foeStrike(f); }
    });
}

/* ---------- start of a fight ---------- */
startGame = function (lv) {
    if (lv) level = lv;
    session++; show("game");
    clearInterval(timer); clearInterval(aiTimer);
    document.querySelectorAll(".foe,.fireball").forEach(e => e.remove());
    foes = []; pending = 0; waveBreak = false; waveMax = 0; wave = 0;
    php = 100; ehp = 100; combo = 0; maxCombo = 0; playerX = 12; paused = false; active = false;
    specialCD = 0; ultimateCD = 0; rage = 0; stunUntil = 0; blocking = false;
    Object.assign(P2, { x: 78, combo: 0, rage: 0, spec: 0, ult: 0, block: false, stun: 0 });
    $("#pause").textContent = "Ⅱ"; updateCooldowns();
    const mode = versus ? "versus" : training ? "training" : "arena";
    $("#lv").textContent = endless ? "∞" : versus ? "VS" : training ? "TR" : String(level).padStart(2, "0");
    $("#clock").textContent = endless ? "WAVE 1 • ∞" : mode === "arena" ? "WAVE 1/" + wavesOf(level) : versus ? "VS" : "∞";
    $("#sceneTitle").textContent = endless ? "ENDLESS BATTLE" : (levels[level - 1] || "").toUpperCase();
    $("#arena").className = "arena t-" + themes[mode === "arena" ? THEME_OF_LEVEL[level - 1] : 0];
    const p = P1.el;
    p.classList.remove("dead-pose", "dying", "raging", "blocking", "hurt", "jump", "walk", "hit", "attack", "kick", "heavy", "dash", "lunge");
    p.style.opacity = ""; p.style.filter = ""; p.style.transform = "";
    p.style.left = playerX + "%"; skin(p, save.get("sacStyle", "Classic"));
    const en = P2.el;
    en.className = "fighter red"; en.style.opacity = ""; en.style.left = P2.x + "%";
    en.style.display = versus ? "" : "none";
    $(".avatar.red").textContent = versus ? "P2" : "EN";
    $("#enemyLabel").textContent = versus ? "PLAYER 2" : training ? "DUMMY" : "GET READY";
    keyHint.textContent = versus ? VS_HINT : defaultHint;
    screens.game.classList.toggle("vs", versus);   // hide the touch buttons in 2-player mode
    $("#combo").textContent = ""; $("#warning").style.display = "none"; $("#bossWarning").style.display = "none";
    updateHP();
    const s = session;
    setTimeout(() => {
        if (s !== session) return;
        active = true;
        if (mode === "arena") startWave(0);
        else if (mode === "training") spawn({ name: "Basic Stickman", dummy: true, max: 100 });
        else banner("FIGHT!", "#ff3158", 1200);
        syncHud();
    }, 900);
    timer = setInterval(() => {
        if (paused || !active) return;
        tickCooldowns();
        if (versus) { if (P2.spec > 0) P2.spec--; if (P2.ult > 0) P2.ult--; if (P2.rage > 0 && --P2.rage <= 0) P2.el.classList.remove("raging"); }
    }, 1000);
    aiTimer = setInterval(aiLoop, 450);
};

/* ---------- player 1 controls (arena + training; the old key handler calls these) ---------- */
attack = function (type) {
    if (paused || !active || versus || !ATK[type] || Date.now() < stunUntil) return;
    doAttack(P1, foes, type);
};
move = function (v) {
    if (paused || !active || Date.now() < stunUntil) return;
    const lim = (versus ? P2.x : nearestFoeX()) - 11;
    playerX = Math.max(4, Math.min(lim, playerX + v));
    P1.el.style.left = playerX + "%"; walk(P1.el);
};
jump = function () { if (paused || !active) return; P1.el.classList.add("jump"); setTimeout(() => P1.el.classList.remove("jump"), 430); sfx("jump"); };
dash = function () {
    if (paused || !active || versus) return;
    playerX = Math.min((nearestFoeX()) - 11, playerX + 10);
    P1.el.style.left = playerX + "%"; P1.el.classList.add("dash"); walk(P1.el);
    particles(playerX, 52, "special"); sfx("dash");
    setTimeout(() => P1.el.classList.remove("dash"), 220);
};

/* ---------- two-player keyboard controls ---------- */
function setBlock(a, v) { a.block = v; a.el.classList.toggle("blocking", v); }
function jumpFor(a) { a.el.classList.add("jump"); setTimeout(() => a.el.classList.remove("jump"), 430); sfx("jump"); }
function vsAttack(a, type) { if (paused || !active || Date.now() < a.stun) return; doAttack(a, [a === P1 ? P2 : P1], type); }
function vsMove(a, v) {
    if (paused || !active || Date.now() < a.stun) return;
    a.x = a === P1 ? Math.max(4, Math.min(P2.x - 8, a.x + v)) : Math.min(92, Math.max(playerX + 8, a.x + v));
    a.el.style.left = a.x + "%"; walk(a.el);
}
window.addEventListener("keydown", e => {
    if (!versus || screens.game.classList.contains("hidden")) return;
    const k = e.key.toLowerCase();
    if (onlineMode) {
        const mine = onlineRole === "host" ? 1 : 2;
        const map = mine === 1
          ? {a:["input","left",true], d:["input","right",true], w:["act","jump"], s:["input","block",true], z:["act","punch"], x:["act","kick"], c:["act","heavy"], v:["act","special"], b:["act","ultimate"]}
          : {arrowleft:["input","left",true], arrowright:["input","right",true], arrowup:["act","jump"], arrowdown:["input","block",true], u:["act","punch"], i:["act","kick"], o:["act","heavy"], p:["act","special"], "[":["act","ultimate"]};
        const item = map[k];
        if (item) {
            e.preventDefault(); e.stopImmediatePropagation();
            if (item[0] === "input") {
                const target = mine === 1 ? P1 : P2;
                if (item[1] === "left") mine === 1 ? hold.a = true : hold.l = true;
                if (item[1] === "right") mine === 1 ? hold.d = true : hold.r = true;
                if (item[1] === "block") setBlock(target, true);
                sendOnline({type:"input", player:mine, key:item[1], down:true});
            } else {
                const target = mine === 1 ? P1 : P2;
                if (item[1] === "jump") jumpFor(target); else vsAttack(target, item[1]);
                sendOnline({type:"act", player:mine, action:item[1]});
            }
        }
        return;
    }
    if (k === "escape") return;
    const act = {
        a: () => { hold.a = true; if (!e.repeat) P1.kv = (P1.kv || 0) - 22; }, d: () => { hold.d = true; if (!e.repeat) P1.kv = (P1.kv || 0) + 22; }, w: () => !paused && active && jumpFor(P1), s: () => setBlock(P1, true),
        z: () => vsAttack(P1, "punch"), x: () => vsAttack(P1, "kick"), c: () => vsAttack(P1, "heavy"), v: () => vsAttack(P1, "special"), b: () => vsAttack(P1, "ultimate"),
        arrowleft: () => { hold.l = true; if (!e.repeat) P2.kv = (P2.kv || 0) - 22; }, arrowright: () => { hold.r = true; if (!e.repeat) P2.kv = (P2.kv || 0) + 22; }, arrowup: () => !paused && active && jumpFor(P2), arrowdown: () => setBlock(P2, true),
        u: () => vsAttack(P2, "punch"), i: () => vsAttack(P2, "kick"), o: () => vsAttack(P2, "heavy"), p: () => vsAttack(P2, "special"), "[": () => vsAttack(P2, "ultimate")
    }[k];
    e.stopImmediatePropagation();       // the single-player key handler must not run in 2-player mode
    if (act) { e.preventDefault(); act(); }
}, true);
window.addEventListener("keyup", e => {
    if (!versus || screens.game.classList.contains("hidden")) return;
    const k = e.key.toLowerCase();
    if (onlineMode) {
        const mine = onlineRole === "host" ? 1 : 2;
        const key = mine === 1 ? ({a:"left",d:"right",s:"block"}[k]) : ({arrowleft:"left",arrowright:"right",arrowdown:"block"}[k]);
        if (key) {
            e.preventDefault(); e.stopImmediatePropagation();
            if (key === "left") mine === 1 ? hold.a = false : hold.l = false;
            if (key === "right") mine === 1 ? hold.d = false : hold.r = false;
            if (key === "block") setBlock(mine === 1 ? P1 : P2, false);
            sendOnline({type:"input", player:mine, key, down:false});
        }
        return;
    }
    if (k === "a") hold.a = false;
    if (k === "d") hold.d = false;
    if (k === "arrowleft") hold.l = false;
    if (k === "arrowright") hold.r = false;
    if (k === "s") setBlock(P1, false);
    if (k === "arrowdown") setBlock(P2, false);
    e.stopImmediatePropagation();
}, true);


/* Local two-player touch input. Each half controls its own fighter. */
document.querySelectorAll("#localTouch [data-local]").forEach(btn => {
  const [who, action] = btn.dataset.local.split(":");
  const player = who === "p1" ? P1 : P2;
  const isMove = action === "left" || action === "right";
  const moveKey = who === "p1" ? (action === "left" ? "a" : "d") : (action === "left" ? "l" : "r");
  const down = e => {
    e.preventDefault();
    if (!versus || onlineMode || !active || paused) return;
    if (isMove) { hold[moveKey] = true; }
    else if (action === "block") setBlock(player, true);
    else if (action === "jump") jumpFor(player);
    else vsAttack(player, action);
  };
  const up = e => {
    e.preventDefault();
    if (isMove) hold[moveKey] = false;
    if (action === "block") setBlock(player, false);
  };
  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("lostpointercapture", up);
});

/* Touch controls for online 1v1 phones */
document.querySelectorAll("#onlineTouch [data-touch]").forEach(btn => {
    const act = btn.dataset.touch;
    const mine = () => onlineRole === "host" ? 1 : 2;
    const sendMove = (key, down) => {
        const n = mine();
        if (key === "left") n === 1 ? hold.a = down : hold.l = down;
        if (key === "right") n === 1 ? hold.d = down : hold.r = down;
        if (key === "block") setBlock(n === 1 ? P1 : P2, down);
        sendOnline({type:"input", player:n, key, down});
    };
    const fire = () => {
        if (!onlineMode || !active) return;
        const n = mine(), f = n === 1 ? P1 : P2;
        if (act === "left" || act === "right") return;
        if (act === "jump") jumpFor(f); else vsAttack(f, act);
        sendOnline({type:"act", player:n, action:act});
    };
    if (act === "left" || act === "right") {
        btn.addEventListener("pointerdown", e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); sendMove(act, true); });
        const release = e => { e.preventDefault(); sendMove(act, false); };
        btn.addEventListener("pointerup", release); btn.addEventListener("pointercancel", release); btn.addEventListener("lostpointercapture", release);
    } else {
        btn.addEventListener("pointerdown", e => { e.preventDefault(); fire(); });
    }
});
/* ---------- menus ---------- */
updatePreview = function () {
    $("#previewTitle").textContent = "LEVEL " + String(level).padStart(2, "0");
    $("#previewInfo").textContent = wavesOf(level) + " waves • up to " + perWave(level) + " enemies" + (BOSS_OF[level] ? " • BOSS: " + BOSS_OF[level] : "") + " • " + (level <= cleared() ? "Cleared" : "Not cleared");
};
$("#next").onclick = () => {
    $("#modal").classList.add("hidden");
    if (versus) startGame(level);                                  // rematch
    else if (training) show("menu");
    else if (lastWin && level < MAX_LEVEL) { level++; startGame(level); }
    else if (!lastWin) startGame(level);
    else show("menu");
};

/* =====================================================================
   SMOOTH MOVEMENT, JOYSTICK, RAGE METER AND DASH TRAIL
   ===================================================================== */
const hold = { a: false, d: false, l: false, r: false };   // held movement keys
let touchDir = 0, dashT = 0, ghostT = 0, rageMeter = 0, lastFrame = performance.now();

/* ----- rage meter (fills as you fight, press R / the fire button when full) ----- */
function renderRage() { $("#rageFill").style.width = rageMeter + "%"; $("#rageBar").classList.toggle("ready", rageMeter >= 100); }
function addRage(n) { if (versus || training) return; rageMeter = Math.min(100, rageMeter + n); renderRage(); }
function activateRage() {
    if (paused || !active || versus || rageMeter < 100) return;
    rageMeter = 0; renderRage(); rage = 8; P1.el.classList.add("raging"); unlock("sacRageU");
    skillTitle("RAGE MODE", "#ff3158"); fx("aura-burst", playerX + 4, 52, 850); sfx("rage"); screenFlash("#a64bff");
}
function renderEnergy() { $("#pen").style.width = Math.round(100 - 100 * ultimateCD / 15) + "%"; }

/* ----- dash: a burst of speed with a trail of after-images ----- */
dash = function () {
    if (paused || !active || versus || Date.now() < stunUntil || dashT > 0) return;
    dashT = 0.22; ghostT = 0; sfx("dash");
    P1.el.classList.add("dash"); setTimeout(() => P1.el.classList.remove("dash"), 220);
};
function ghost() {
    const g = P1.el.cloneNode(true);
    g.removeAttribute("id"); g.classList.remove("walk", "dash", "hurt");
    g.classList.add("ghost"); g.style.left = playerX + "%";
    $("#arena").insertBefore(g, P1.el);
    setTimeout(() => g.remove(), 320);
}

/* ----- per-frame movement: acceleration, walk cycle, smooth knockback ----- */
function stepFighter(e, dir, dt, lo, hi, speed) {
    e.vx = (e.vx || 0) + (dir * speed - (e.vx || 0)) * Math.min(1, dt * 11);
    e.kv = e.kv || 0;
    const nx = Math.max(lo, Math.min(hi, e.x + (e.vx + e.kv) * dt));
    e.kv *= Math.exp(-dt * 9);
    if (Math.abs(nx - e.x) > 0.001) { e.x = nx; e.el.style.left = nx + "%"; }
    e.el.classList.toggle("walk", Math.abs(e.vx) > 5 && !e.el.classList.contains("jump"));
}
function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - lastFrame) / 1000); lastFrame = t;
    updateCam(dt); updateEnergy(dt);
    if (screens.game.classList.contains("hidden") || !active || paused) return;
    const now = Date.now();
    if (now < freezeUntil) return;          // hit-stop: a tiny freeze on heavy hits
    applyFacing();
    let d1 = versus ? (hold.d ? 1 : 0) - (hold.a ? 1 : 0) : ((hold.d || hold.r) ? 1 : 0) - ((hold.a || hold.l) ? 1 : 0) || touchDir;
    if (now < stunUntil) d1 = 0;
    let sp = 30;
    if (dashT > 0) { dashT -= dt; d1 = d1 || 1; sp = 110; ghostT -= dt; if (ghostT <= 0) { ghostT = 0.045; ghost(); } }
    const lim = versus ? { lo: 4, hi: P2.x - 8 } : foeLimits();
    stepFighter(P1, d1, dt, lim.lo, Math.max(lim.lo, lim.hi), sp);
    if (versus) {
        const d2 = now < P2.stun ? 0 : (hold.r ? 1 : 0) - (hold.l ? 1 : 0);
        stepFighter(P2, d2, dt, Math.min(92, playerX + 8), 92, 30);
        return;
    }
    foes.forEach(f => {
        if (f.dead || f.el.classList.contains("spawning")) return;
        f.kv = f.kv || 0;
        const want = f.dummy ? Math.max(playerX + 10, 62) : (f.want === undefined ? f.x : f.want);
        const sp2 = (16 + diff() * 0.45) * f.speed;
        const step = now < f.stun ? 0 : Math.max(-sp2 * dt, Math.min(sp2 * dt, want - f.x));
        const raw = f.x + step + f.kv * dt;
        const nx = f.side > 0 ? Math.max(playerX + 8, Math.min(95, raw)) : Math.min(playerX - 8, Math.max(2, raw));
        f.kv *= Math.exp(-dt * 9);
        if (Math.abs(nx - f.x) > 0.001) { f.x = nx; f.el.style.left = nx + "%"; }
        f.el.classList.toggle("walk", Math.abs(step) / dt > 3 && !f.el.classList.contains("lunge"));
    });
}
requestAnimationFrame(frame);

/* ----- keyboard (single player): held keys give continuous movement ----- */
window.addEventListener("keydown", e => {
    if (versus || screens.game.classList.contains("hidden")) return;
    const k = e.key.toLowerCase();
    if (k === "a" || k === "d" || k === "arrowleft" || k === "arrowright") {
        e.preventDefault(); e.stopImmediatePropagation();
        hold[{ a: "a", d: "d", arrowleft: "l", arrowright: "r" }[k]] = true;
        if (!e.repeat) P1.kv = (P1.kv || 0) + (k === "a" || k === "arrowleft" ? -22 : 22);   // a quick tap still nudges you
    }
    else if (k === "arrowup") { e.preventDefault(); jump(); }
    else if (k === "r") { e.stopImmediatePropagation(); activateRage(); }
}, true);
window.addEventListener("keyup", e => {
    const k = e.key.toLowerCase();
    if (k === "a") hold.a = false; if (k === "d") hold.d = false;
    if (k === "arrowleft") hold.l = false; if (k === "arrowright") hold.r = false;
});
window.addEventListener("blur", () => { hold.a = hold.d = hold.l = hold.r = false; touchDir = 0; });

/* ----- on-screen joystick ----- */
(() => {
    const joy = $("#joy"), knob = $("#joyKnob");
    let id = null, jumped = false;
    function track(e) {
        const r = joy.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const m = Math.min(1, Math.hypot(dx, dy) / (r.width / 2 - 14)), ang = Math.atan2(dy, dx);
        knob.style.transform = "translate(" + Math.cos(ang) * m * r.width * 0.28 + "px," + Math.sin(ang) * m * r.width * 0.28 + "px)";
        touchDir = Math.abs(dx) > 14 ? Math.sign(dx) : 0;
        if (dy < -r.height * 0.27 && !jumped) { jumped = true; jump(); }
        if (dy > -r.height * 0.15) jumped = false;
    }
    joy.addEventListener("pointerdown", e => { id = e.pointerId; joy.setPointerCapture(id); track(e); });
    joy.addEventListener("pointermove", e => { if (e.pointerId === id) track(e); });
    ["pointerup", "pointercancel"].forEach(ev => joy.addEventListener(ev, e => { if (e.pointerId === id) { id = null; touchDir = 0; jumped = false; knob.style.transform = ""; } }));
})();

/* ----- on-screen skill buttons ----- */
document.querySelectorAll("[data-atk]").forEach(b => {
    b.onclick = null;
    const k = b.dataset.atk;
    b.addEventListener("pointerdown", e => {
        e.preventDefault();
        if (k === "block") setBlock(P1, true);
        else if (k === "dash") dash();
        else if (k === "rage") activateRage();
        else attack(k);
    });
    if (k === "block") ["pointerup", "pointerleave", "pointercancel"].forEach(ev => b.addEventListener(ev, () => setBlock(P1, false)));
});
$("#cdSpecial").parentElement.addEventListener("pointerdown", () => attack("special"));
$("#cdUltimate").parentElement.addEventListener("pointerdown", () => attack("ultimate"));

/* ----- reset the extras at the start of every fight ----- */
{
    const startBase = startGame;
    startGame = function (lv) {
        startBase(lv);
        hold.a = hold.d = hold.l = hold.r = false; touchDir = 0; dashT = 0; rageMeter = 0;
        P1.vx = 0; P1.kv = 0; P2.vx = 0; P2.kv = 0;
        renderRage(); renderEnergy();
    };
    const tickBase = tickCooldowns;
    tickCooldowns = function () { tickBase(); renderEnergy(); };
}

/* =====================================================================
   ENEMIES FROM BOTH SIDES + MORE POLISH
   ===================================================================== */
let freezeUntil = 0;

// walking limits: you cannot walk through an enemy on either side of you
function foeLimits() {
    let lo = 4, hi = 92;
    foes.forEach(f => {
        if (f.dead || f.el.classList.contains("spawning")) return;
        if (f.x < playerX) lo = Math.max(lo, f.x + 8); else hi = Math.min(hi, f.x - 8);
    });
    return { lo, hi };
}

// facing: mirror a fighter with the CSS "--sx" variable (this also mirrors every animation)
function setFlip(e, flip) {
    const v = flip ? "-1" : "1";
    if (e._sx !== v) { e._sx = v; e.el.style.setProperty("--sx", v); }
}
function applyFacing() {
    if (versus) { setFlip(P1, false); setFlip(P2, false); return; }
    const live = foes.filter(f => !f.dead && !f.el.classList.contains("spawning"));
    if (live.length) {
        const n = live.reduce((m, f) => Math.abs(f.x - playerX) < Math.abs(m.x - playerX) ? f : m);
        P1.dir = Math.sign(n.x - playerX) || P1.dir;
    }
    else if (Math.abs(P1.vx || 0) > 8) P1.dir = Math.sign(P1.vx);
    setFlip(P1, P1.dir < 0);
    live.forEach(f => setFlip(f, playerX > f.x));    // enemies are drawn facing left
}

// dust puffs under running feet + walk cycle that speeds up with the run
let dustT = 0;
function dust(e) {
    sfx("step", e === P1 ? 1 : 0.5);
    const d = document.createElement("i");
    d.className = "dust"; d.style.left = (e.x + 3) + "%";
    d.style.setProperty("--dx", (e.vx >= 0 ? -16 : 16) + "px");
    $("#arena").appendChild(d); setTimeout(() => d.remove(), 520);
}
{
    const stepBase = stepFighter;
    stepFighter = function (e, dir, dt, lo, hi, speed) {
        stepBase(e, dir, dt, lo, hi, speed);
        const v = Math.abs(e.vx || 0);
        if (v > 5) {
            e.el.style.setProperty("--wk", (0.62 - 0.25 * Math.min(1, v / 30)) + "s");
            dustT -= dt; if (dustT <= 0 && !e.el.classList.contains("jump")) { dustT = Math.max(0.06, 0.2 - v / 400); dust(e); }
        }
    };
}

// enemies fall away from you when defeated, and the player starts in the middle of the arena
{
    const killBase = kill;
    kill = function (t) { if (t.foe && !versus) t.el.style.setProperty("--fall", "34px"); killBase(t); };
    const startBase2 = startGame;
    startGame = function (lv) {
        startBase2(lv);
        if (!versus) { playerX = 46; P1.el.style.left = playerX + "%"; P1.dir = 1; P1._sx = undefined; }
        freezeUntil = 0;
        window.musicIntensity = versus ? 1.5 : 1;
        energy = 100; tookDamage = false; recordAtStart = bestCombo(); newRecordShown = false; renderBest();
        showIntro();
    };
}

// scenery layers (stars, distant mountains, drifting mist, falling petals)
$("#arena").insertAdjacentHTML("afterbegin", '<div class="bg-stars"></div><div class="bg-far"></div>');
$("#arena").insertAdjacentHTML("beforeend", '<div class="bg-mist"></div><div class="bg-petals"></div>');

/* ----- camera: the scenery follows where you are standing (parallax) ----- */
const arenaEl = $("#arena");
let camX = 0, camShown = 0, arenaW = 1280;
function updateCam(dt) {
    if (screens.game.classList.contains("hidden")) return;
    arenaW = arenaEl.clientWidth || arenaW;
    const focus = versus ? (playerX + P2.x) / 2 : playerX;       // two-player: follow the middle of both fighters
    camX += ((focus - 46) / 100 * arenaW - camX) * Math.min(1, dt * 6);
    if (Math.abs(camX - camShown) > 0.2) { camShown = camX; arenaEl.style.setProperty("--cam", camX.toFixed(1) + "px"); }
}

/* =====================================================================
   EFFECTS AND DISPLAY POLISH
   ===================================================================== */
// floating numbers can carry a style (critical hits are bigger and gold)
function floatText(text, x, y, cls) {
    const f = document.createElement("span");
    f.className = "float" + (cls ? " " + cls : ""); f.textContent = text;
    f.style.left = x + "%"; f.style.top = y + "%";
    $("#floaters").appendChild(f); setTimeout(() => f.remove(), 800);
}
function popCombo() { const c = $("#combo"); c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop"); }
function screenFlash(color) {
    const d = document.createElement("div");
    d.className = "flash"; if (color) d.style.background = color;
    $("#arena").appendChild(d); setTimeout(() => d.remove(), 320);
}
// "LEVEL 3 / CITY" title card at the start of a fight
function showIntro() {
    document.querySelectorAll(".intro").forEach(e => e.remove());
    const d = document.createElement("div"); d.className = "intro";
    const big = endless ? "ENDLESS BATTLE" : versus ? "PLAYER 1 <i>VS</i> PLAYER 2" : training ? "TRAINING" : "LEVEL " + String(level).padStart(2, "0");
    const sub = endless ? "SURVIVE AS LONG AS YOU CAN" : versus ? "P1: WASD + F G H R T   •   P2: ARROWS + / . , R-SHIFT R-CTRL" : training ? "" : (levels[level - 1] || "").toUpperCase() + (BOSS_OF[level] ? " • BOSS: " + BOSS_OF[level].toUpperCase() : "");
    d.innerHTML = "<b>" + big + "</b><small>" + sub + "</small>";
    screens.game.appendChild(d); setTimeout(() => d.remove(), 1700);
}
// red pulsing screen edge when your health is low
{
    const hpBase = updateHP;
    updateHP = function () { hpBase(); screens.game.classList.toggle("danger", php > 0 && php < 30 && !versus); };
}
/* =====================================================================
   CHARACTER SCREEN v2: outfit, glow colour, scarf colour, eye colour
   (the old "Aura" row is now "Eye Color"); changes show live on the
   preview and on your fighter in battle; SAVE keeps them for next time
   ===================================================================== */
(() => {
    const STYLES = ["Classic", "Ninja", "Warrior", "Shadow", "Cyber", "Champion"];
    const GLOWS = ["#2a7bff", "#00e5ff", "#ff2a4a", "#ffd23f", "#31e37b", "#a66cff", "#ff8a2a", "#ff5fd0", "#ffffff"];
    const EYES = ["#eaf7ff", "#4de1ff", "#ff4a5e", "#ffe14d", "#5dff8f", "#c18cff", "#ff9a3d", "#ff7ad9"];
    const DEFAULT = { style: "Classic", glow: "#2a7bff", scarf: null, eyes: "#eaf7ff" };
    let saved = {};
    try { saved = JSON.parse(save.get("sacLook", "{}")) || {}; } catch (e) { }
    const look = Object.assign({}, DEFAULT, { style: save.get("sacStyle", "Classic") }, saved);
    const stage = $("#customFighter");

    function apply() {
        [stage, P1.el].forEach(el => {
            el.style.setProperty("--glow", look.glow);
            el.style.setProperty("--scarf", look.scarf || look.glow);
            el.style.setProperty("--eye", look.eyes);
            skin(el, look.style);
        });
    }

    $(".options").innerHTML =
        '<h3>OUTFIT</h3><div class="choices" id="cStyles"></div>' +
        '<h3>GLOW COLOR</h3><div class="colors" id="cGlow"></div>' +
        '<h3>SCARF COLOR</h3><div class="colors" id="cScarf"></div>' +
        '<h3>EYE COLOR</h3><div class="colors" id="cEyes"></div>' +
        '<div class="btnrow"><button id="cReset">RESET</button><button class="primary" id="cSave">SAVE</button></div>';

    function row(id, list, key, same) {
        const box = $(id); box.innerHTML = "";
        list.forEach(c => {
            const b = document.createElement("button");
            b.style.background = c; b.title = c;
            b.onclick = () => { look[key] = c; apply(); refresh(); };
            b.dataset.c = c; box.appendChild(b);
        });
    }
    function refresh() {
        document.querySelectorAll("#cStyles button").forEach(b => b.classList.toggle("active", b.textContent === look.style));
        document.querySelectorAll("#cGlow button").forEach(b => b.classList.toggle("active", b.dataset.c === look.glow));
        document.querySelectorAll("#cScarf button").forEach(b => b.classList.toggle("active", b.dataset.c === (look.scarf || look.glow)));
        document.querySelectorAll("#cEyes button").forEach(b => b.classList.toggle("active", b.dataset.c === look.eyes));
    }
    STYLES.forEach(s => {
        const b = document.createElement("button");
        b.textContent = s; b.onclick = () => { look.style = s; apply(); refresh(); };
        $("#cStyles").appendChild(b);
    });
    row("#cGlow", GLOWS, "glow"); row("#cScarf", GLOWS, "scarf"); row("#cEyes", EYES, "eyes");

    $("#cSave").onclick = () => {
        save.set("sacLook", JSON.stringify(look)); save.set("sacStyle", look.style); save.set("sacGlow", look.glow);
        $("#cSave").textContent = "SAVED ✓"; setTimeout(() => { $("#cSave").textContent = "SAVE"; }, 1300);
    };
    $("#cReset").onclick = () => { Object.assign(look, DEFAULT); apply(); refresh(); };

    // preview buttons: see the walk, punch and kick on your outfit
    stage.parentElement.insertAdjacentHTML("beforeend", '<div class="pv"><button data-pv="idle">IDLE</button><button data-pv="walk">WALK</button><button data-pv="punch">PUNCH</button><button data-pv="kick">KICK</button></div>');
    document.querySelectorAll("[data-pv]").forEach(b => b.addEventListener("click", () => {
        const k = b.dataset.pv;
        stage.classList.toggle("walk", k === "walk");
        if (k === "punch" || k === "kick") { pose(stage, k, 260); sfx(k); }
    }));

    apply(); refresh();
})();

/* =====================================================================
   ENERGY BAR (the blue bar under your health)
   ===================================================================== */
/* ----- energy: attacks and dashing spend it, blocking drains it, it refills when you rest ----- */
let energy = 100, energyHold = 0, lastLow = 0, tookDamage = false, energyShown = -1;
const COST = { punch: 2, kick: 4, heavy: 8, special: 16, ultimate: 28 };
function lowEnergy() { if (Date.now() - lastLow > 800) { lastLow = Date.now(); skillTitle("LOW ENERGY", "#6aa8ff"); } }
function renderEnergy() {
    const w = Math.round(energy);
    if (w === energyShown) return;
    energyShown = w; $("#pen").style.width = w + "%";
    $("#pen").parentElement.classList.toggle("low", w < 25);
}
function updateEnergy(dt) {
    if (versus || !active || paused || screens.game.classList.contains("hidden")) return;
    if (blocking) { energy = Math.max(0, energy - 14 * dt); if (energy <= 0) setBlock(P1, false); }
    else if (Date.now() > energyHold) energy = Math.min(100, energy + (20 + upg().en * 2) * dt);
    renderEnergy();
}
{
    const atkBase = attack;
    attack = function (type) {
        if (versus || paused || !active) return atkBase(type);
        const onCooldown = (type === "special" && specialCD > 0) || (type === "ultimate" && ultimateCD > 0);
        if (!onCooldown && Date.now() >= stunUntil) {
            const c = COST[type] || 0;
            if (energy < c) { lowEnergy(); return; }
            energy -= c; energyHold = Date.now() + 700;
        }
        atkBase(type);
    };
    const dashBase = dash;
    dash = function () {
        if (versus || paused || !active || dashT > 0 || Date.now() < stunUntil) return dashBase();
        if (energy < 10) { lowEnergy(); return; }
        energy -= 10; energyHold = Date.now() + 700; dashBase();
    };
}

/* ----- achievements removed; keep combat hooks harmless ----- */
const bestCombo = () => Number(save.get("sacBestCombo", 0));
function unlock() {}
function checkRich() {}

/* ----- highest combo: remembered forever and shown in the HUD and result box ----- */
let recordAtStart = bestCombo(), newRecordShown = false;
function renderBest() { const n = $("#bestNum"); if (n) n.textContent = bestCombo(); }
function recordCombo(n) {
    if (n > bestCombo()) {
        if (!newRecordShown && recordAtStart >= 3 && !versus) { newRecordShown = true; skillTitle("NEW COMBO RECORD!", "#ffd23f"); }
        save.set("sacBestCombo", n); renderBest();
    }
    if (n >= 10) unlock("sacCombo");
}
$(".hp.en").insertAdjacentHTML("afterend", '<small id="bestHud">BEST COMBO: <b id="bestNum">0</b></small>');
renderBest();
