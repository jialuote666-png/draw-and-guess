// 前端单页应用入口：用 Vue 在 client.ejs 中根据 pageStatus 切换不同子页面。

var socket = null

var app = new Vue({
  el: '#game',
  data: {
    username: '',
    password: '',

    user_entity: {
      username: '',
      pageStatus: 0,
      room_name: null,
      drawFlag: false,
      question: null
    },

    room_entity: {
      roomName: '',
      admin: '',
      users: [],
      question_list: []
    },

    // New features state
    timer: 60,
    timerInterval: null,
    chatMessages: [],
    scores: {},
    currentDrawer: '',
    roundGuessed: {},

    // Lobby features
    roomList: [],
    onlineUsers: {},

    // Alerts
    alerts: []
  },
  mounted: function () {
    connect()
    this.initCanvas()
  },
  watch: {
    'user_entity.pageStatus': function (newStatus) {
      if (newStatus === 3) {
        // 进入画图页面
        this.$nextTick(function () {
          initDrawCanvas()
        })
        this.chatMessages = []
        this.currentDrawer = this.user_entity.username
        this.roundGuessed = {}
        this.startRoundAsDrawer()
      } else if (newStatus === 4) {
        // 进入答案页面
        this.$nextTick(function () {
          initAnswerCanvas()
        })
        this.chatMessages = []
        this.currentDrawer = ''
        this.timer = 60
        this.broadcast({ type: 'request-state' })
      } else if (newStatus === 5 || newStatus === 6) {
        this.stopTimer()
        // Keep scores for round over and game over pages
      }
    }
  },
  methods: {
    login: function () {
      var username = document.getElementById('username').value
      var password = document.getElementById('password').value

      // Validate input
      if (!username || username.trim() === '') {
        this.showError('Username is required')
        return
      }

      if (!password || password.trim() === '') {
        this.showError('Password is required')
        return
      }

      this.username = username
      this.password = password

      socket.emit('login', { username: username, password: password })
    },

    handleLoginResponse: function (data) {
      if (data.result) {
        // alert('Login successful');
        socket.emit('join', { username: this.username })
      } else {
        alert('Login failed: ' + data.msg)
      }
    },

    createRoom: function () {
      var roomName = document.getElementById('roomName').value
      socket.emit('createRoom', { roomName: roomName })
    },

    joinRoom: function () {
      var roomName = document.getElementById('roomName').value
      socket.emit('join-room', { roomName: roomName })
    },

    admin(action) {
      socket.emit('admin', { action: action })
    },

    drawOver() {
      socket.emit('draw-over', {})
    },

    backToRoom() {
      socket.emit('back-to-room', {})
    },

    initCanvas: function () {
      // 初始化画板会在 watch 中根据 pageStatus 调用
    },

    startRoundAsDrawer: function () {
      this.timer = 60
      this.broadcast({ type: 'timer', time: 60 })
      this.broadcast({ type: 'drawer-info', username: this.user_entity.username })

      if (this.timerInterval) clearInterval(this.timerInterval)
      this.timerInterval = setInterval(() => {
        this.timer--
        this.broadcast({ type: 'timer', time: this.timer })
        if (this.timer <= 0) {
          this.stopTimer()
          this.drawOver()
        }
      }, 1000)
    },

    stopTimer: function () {
      if (this.timerInterval) {
        clearInterval(this.timerInterval)
        this.timerInterval = null
      }
    },

    broadcast: function (data) {
      socket.emit('draw-data', data)
    },

    sendMessage: function () {
      var input = document.getElementById('chatInput')
      if (!input || !input.value) return
      var text = input.value
      input.value = ''

      var msg = { type: 'chat', text: text, sender: this.username }
      this.chatMessages.push(msg)
      this.broadcast(msg)
    },

    handleCustomData: function (data) {
      if (data.type === 'timer') {
        this.timer = data.time
      } else if (data.type === 'request-state') {
        if (this.user_entity.pageStatus === 3) {
          this.broadcast({ type: 'state', time: this.timer, drawer: this.user_entity.username })
        }
      } else if (data.type === 'drawer-info') {
        this.currentDrawer = data.username
      } else if (data.type === 'state') {
        if (typeof data.time === 'number') this.timer = data.time
        if (data.drawer) this.currentDrawer = data.drawer
      } else if (data.type === 'chat') {
        this.chatMessages.push(data)
        if (this.user_entity.pageStatus === 3) {
          // If I am drawer
          this.checkAnswer(data)
        }
      } else if (data.type === 'score') {
        this.$set(this.scores, data.username, (this.scores[data.username] || 0) + data.score)
      }
    },

    checkAnswer: function (msg) {
      if (!this.user_entity.question) return
      if (msg.text.toLowerCase().trim() === this.user_entity.question.content.toLowerCase().trim()) {
        if (this.roundGuessed[msg.sender]) return
        this.$set(this.roundGuessed, msg.sender, true)
        var sysMsg = { type: 'chat', text: msg.sender + ' guessed correctly!', sender: 'System' }
        this.broadcast(sysMsg)
        this.chatMessages.push(sysMsg)

        // Update score
        var score = Math.ceil(this.timer)
        this.$set(this.scores, msg.sender, (this.scores[msg.sender] || 0) + score)
        this.$set(this.scores, this.user_entity.username, (this.scores[this.user_entity.username] || 0) + 10)

        this.broadcast({ type: 'score', username: msg.sender, score: score })
        this.broadcast({ type: 'score', username: this.user_entity.username, score: 10 })

        var drawerName = this.user_entity.username
        var guessers = (this.room_entity.users || []).filter((u) => u && u !== drawerName)
        var allGuessed = guessers.length > 0 && guessers.every((u) => this.roundGuessed[u])
        if (allGuessed) {
          this.drawOver()
        }
      }
    },

    leaveRoom: function () {
      // Notify server that user is leaving room
      socket.emit('leave-room', {})

      // Reset room-specific data
      this.room_entity.roomName = ''
      this.room_entity.admin = ''
      this.room_entity.users = []
      this.room_entity.question_list = []

      // Reset game-specific data
      this.scores = {}
      this.currentDrawer = ''
      this.roundGuessed = {}
      this.chatMessages = []
      this.stopTimer()

      // Set user back to lobby
      this.user_entity.pageStatus = 1
      this.user_entity.room_name = null
      this.user_entity.drawFlag = false
      this.user_entity.question = null
    },

    showError: function (message) {
      // Display error message using Vue alerts
      var alertId = Date.now()
      this.alerts.push({
        id: alertId,
        type: 'danger',
        message: message,
        hidden: false
      })

      // Auto hide after 3 seconds
      setTimeout(() => {
        var alertIndex = this.alerts.findIndex((alert) => alert.id === alertId)
        if (alertIndex !== -1) {
          this.alerts.splice(alertIndex, 1)
        }
      }, 3000)
    }
  }
})

function connect() {
  socket = io()

  socket.on('connect', function () {
    console.log('connected')
  })

  socket.on('connect_error', function (message) {
    alert('Unable to connect: ' + message)
  })

  socket.on('disconnect', function () {
    // alert('Disconnected');
  })

  socket.on('login-response', function (data) {
    app.handleLoginResponse(data)
  })

  socket.on('update-user', function (data) {
    app.user_entity['pageStatus'] = data.pageStatus
    app.user_entity['room_name'] = data.room_name
    app.user_entity['drawFlag'] = data.drawFlag
    app.user_entity['username'] = data.username
    app.user_entity['question'] = data.question
  })

  socket.on('update-room', function (data) {
    app.room_entity['roomName'] = data.roomName
    app.room_entity['admin'] = data.admin
    app.room_entity['users'] = data.users
    app.room_entity['question_list'] = data.question_list
    // Update scores if provided
    if (data.scores) {
      app.scores = data.scores
    }
  })

  socket.on('lobby-info', function (data) {
    app.roomList = data.roomList
    app.onlineUsers = data.onlineUsers
  })

  socket.on('draw-data', function (data) {
    // 接收画图数据并绘制到 answer canvas
    if (data.type) {
      app.handleCustomData(data)
    } else {
      drawOnAnswerCanvas(data)
    }
  })

  socket.on('canvas-clear', function () {
    // 清除答案画板
    clearAnswerCanvas()
  })

  socket.on('error', function (data) {
    var alertId = Date.now()
    app.alerts.push({
      id: alertId,
      type: 'danger',
      message: data.message,
      hidden: false
    })

    setTimeout(function () {
      var alertIndex = app.alerts.findIndex(function (alert) {
        return alert.id === alertId
      })
      if (alertIndex !== -1) {
        app.alerts.splice(alertIndex, 1)
      }
    }, 3000)
  })
}

// 画图相关变量
var drawCanvas = null
var drawCtx = null
var answerCanvas = null
var answerCtx = null
var isDrawing = false
var lastX = 0
var lastY = 0

// 初始化画图画板
function initDrawCanvas() {
  drawCanvas = document.getElementById('drawCanvas')
  if (!drawCanvas) return

  drawCtx = drawCanvas.getContext('2d')

  // 设置画布大小
  drawCanvas.width = 800
  drawCanvas.height = 600

  // 清除画布
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height)

  // 设置画笔样式
  drawCtx.strokeStyle = '#000000'
  drawCtx.lineWidth = 3
  drawCtx.lineCap = 'round'
  drawCtx.lineJoin = 'round'

  // 重置画图状态
  isDrawing = false

  // 鼠标事件
  drawCanvas.addEventListener('mousedown', startDrawing)
  drawCanvas.addEventListener('mousemove', draw)
  drawCanvas.addEventListener('mouseup', stopDrawing)
  drawCanvas.addEventListener('mouseout', stopDrawing)

  // 触摸事件（移动端支持）
  drawCanvas.addEventListener('touchstart', handleTouch)
  drawCanvas.addEventListener('touchmove', handleTouch)
  drawCanvas.addEventListener('touchend', stopDrawing)

  // 清除按钮
  var clearBtn = document.getElementById('clearBtn')
  if (clearBtn) {
    // 移除旧的事件监听器（如果存在）
    clearBtn.replaceWith(clearBtn.cloneNode(true))
    var newClearBtn = document.getElementById('clearBtn')
    newClearBtn.addEventListener('click', function () {
      if (drawCtx && drawCanvas) {
        drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height)
        // 发送清除事件
        socket.emit('draw-clear', {})
      }
    })
  }
}

// 初始化答案画板
function initAnswerCanvas() {
  answerCanvas = document.getElementById('answerCanvas')
  if (!answerCanvas) return

  answerCtx = answerCanvas.getContext('2d')

  // 设置画布大小
  answerCanvas.width = 800
  answerCanvas.height = 600

  // 清除画布
  answerCtx.clearRect(0, 0, answerCanvas.width, answerCanvas.height)

  // 设置画笔样式
  answerCtx.strokeStyle = '#000000'
  answerCtx.lineWidth = 3
  answerCtx.lineCap = 'round'
  answerCtx.lineJoin = 'round'
}

// 开始画图
function startDrawing(e) {
  isDrawing = true
  var rect = drawCanvas.getBoundingClientRect()
  lastX = e.clientX - rect.left
  lastY = e.clientY - rect.top
}

// 画图
function draw(e) {
  if (!isDrawing) return

  var rect = drawCanvas.getBoundingClientRect()
  var currentX = e.clientX - rect.left
  var currentY = e.clientY - rect.top

  drawCtx.beginPath()
  drawCtx.moveTo(lastX, lastY)
  drawCtx.lineTo(currentX, currentY)
  drawCtx.stroke()

  // 发送画图数据到服务器
  socket.emit('draw-data', {
    x1: lastX,
    y1: lastY,
    x2: currentX,
    y2: currentY
  })

  lastX = currentX
  lastY = currentY
}

// 停止画图
function stopDrawing() {
  isDrawing = false
}

// 处理触摸事件
function handleTouch(e) {
  e.preventDefault()
  var touch = e.touches[0]
  var mouseEvent = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : e.type === 'touchmove' ? 'mousemove' : 'mouseup', {
    clientX: touch.clientX,
    clientY: touch.clientY
  })
  drawCanvas.dispatchEvent(mouseEvent)
}

// 在答案画板上绘制
function drawOnAnswerCanvas(data) {
  if (!answerCanvas || !answerCtx) return

  answerCtx.beginPath()
  answerCtx.moveTo(data.x1, data.y1)
  answerCtx.lineTo(data.x2, data.y2)
  answerCtx.stroke()
}

// 清除答案画板
function clearAnswerCanvas() {
  if (!answerCanvas || !answerCtx) return
  answerCtx.clearRect(0, 0, answerCanvas.width, answerCanvas.height)
}
