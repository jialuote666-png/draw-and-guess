class RoomEntity {
  constructor(roomName, adminName, maxRounds = 3) {
    this.roomName = roomName;               // 房间名
    this.adminName = adminName;             // 房间管理员
    this.userList = new Set();              // 用 Set 更适合玩家列表
    this.drawUser = null;                   // 当前画家
    this.roundCount = 0;                    // 当前轮数
    this.maxRounds = maxRounds;             // 总轮数
    this.qcard = null;                      // 当前题目
    this.status = "waiting";                // waiting | playing | round_over | end
    this.answerBoard = new Map();           // <userName, answer>
    this.scoreBoard = new Map();            // <userName, score>
  }

  /* --------------------- 玩家管理 --------------------- */

  addUser(userName) {
    this.userList.add(userName);
    if (!this.scoreBoard.has(userName)) {
      this.scoreBoard.set(userName, 0);
    }
  }

  removeUser(userName) {
    this.userList.delete(userName);
    this.answerBoard.delete(userName);
    this.scoreBoard.delete(userName);

    if (this.drawUser === userName) {
      this.drawUser = null;
    }
  }

  /* --------------------- 游戏流程控制 --------------------- */

  startRound(drawUser, qcard) {
    this.drawUser = drawUser;
    this.qcard = qcard;
    this.roundCount += 1;
    this.status = "playing";
    this.answerBoard.clear(); // 清空上一轮答案
  }

  endRound() {
    this.status = "round_over";
  }

  endGame() {
    this.status = "end";
  }

  /* --------------------- 答案与得分 --------------------- */

  submitAnswer(userName, answer) {
    this.answerBoard.set(userName, answer);
  }

  addScore(userName, score) {
    if (this.scoreBoard.has(userName)) {
      this.scoreBoard.set(userName, this.scoreBoard.get(userName) + score);
    }
  }

  /* --------------------- 辅助方法 --------------------- */

  toJSON() {
    // 返回适合发送给前端的对象
    return {
      roomName: this.roomName,
      adminName: this.adminName,
      userList: Array.from(this.userList),
      drawUser: this.drawUser,
      roundCount: this.roundCount,
      maxRounds: this.maxRounds,
      qcard: this.qcard,
      status: this.status,
      answerBoard: Object.fromEntries(this.answerBoard),
      scoreBoard: Object.fromEntries(this.scoreBoard)
    };
  }
}

module.exports = RoomEntity;
