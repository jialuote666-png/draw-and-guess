class UserEntity {
  constructor(userName, password = null, socket = null) {
    this.userName = userName;            // 用户名
    this.password = password;            // 密码
    this.pageStatus = "lobby";           // 前端路由状态（例如 lobby / room / game 等）
    this.gameStatus = "idle";            // idle / drawing / guessing / finished
    this.answer = null;                  // 当前用户答案
    this.socket = socket;                // 用户的 WebSocket 连接
    this.onlineStatus = "online";        // online / offline
  }

  /* ------------------------ 状态管理 ------------------------ */

  setPageStatus(status) {
    this.pageStatus = status;
  }

  setGameStatus(status) {
    this.gameStatus = status;
  }

  setOnlineStatus(status) {
    this.onlineStatus = status;
  }

  /* ------------------------ 答案管理 ------------------------ */

  submitAnswer(answer) {
    this.answer = answer;
  }

  clearAnswer() {
    this.answer = null;
  }

  /* ------------------------ WebSocket 操作 ------------------------ */

  bindSocket(socket) {
    this.socket = socket;
    this.onlineStatus = "online";
  }

  disconnect() {
    this.onlineStatus = "offline";
    this.socket = null;
  }

  send(event, data) {
    if (this.socket && this.onlineStatus === "online") {
      this.socket.emit(event, data);
    }
  }

  /* ------------------------ JSON 输出 ------------------------ */

  toJSON() {
    return {
      userName: this.userName,
      password: this.password,
      pageStatus: this.pageStatus,
      gameStatus: this.gameStatus,
      answer: this.answer,
      onlineStatus: this.onlineStatus,
    };
  }
}

module.exports = UserEntity;
