(function () {
  const NICK_STORAGE_KEY = "tetrisNick";
  const startScreen = document.getElementById("start-screen");
  const game2d = document.getElementById("game-2d");
  const game3d = document.getElementById("game-3d");
  const btn2d = document.getElementById("btn-2d");
  const btn3d = document.getElementById("btn-3d");
  const nickInput = document.getElementById("start-nick");

  function commitNicknameToSession() {
    const raw = nickInput && nickInput.value ? nickInput.value : "";
    const trimmed = raw.trim();
    const nick = trimmed.length > 0 ? trimmed.slice(0, 24) : "Player";
    try {
      sessionStorage.setItem(NICK_STORAGE_KEY, nick);
    } catch {
      // ignore quota / private mode
    }
  }

  function loadScript(src, onload, onerror) {
    const s = document.createElement("script");
    s.src = src;
    s.onload = onload;
    s.onerror = onerror || function () {
      window.alert("Failed to load script: " + src);
    };
    document.body.appendChild(s);
  }

  btn2d.addEventListener("click", function () {
    commitNicknameToSession();
    startScreen.hidden = true;
    game2d.hidden = false;
    loadScript("./game2d.js");
    btn2d.disabled = true;
    btn3d.disabled = true;
  });

  btn3d.addEventListener("click", function () {
    commitNicknameToSession();
    startScreen.hidden = true;
    game3d.hidden = false;
    btn2d.disabled = true;
    btn3d.disabled = true;
    loadScript(
      "https://unpkg.com/three@0.160.0/build/three.min.js",
      function () {
        loadScript("./game3d.js");
      }
    );
  });
})();
