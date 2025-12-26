'use strict'

const express = require('express')
const http = require('http')
const { Server } = require('socket.io')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

// ------------- 一、数据结构 -------------

const room_map = new Map() // roomName -> RoomEntity
const user_map = new Map() // username -> UserEntity
const socket2user = new Map() // socketID -> UserEntity
const online_users = new Map() // username -> boolean (online status)

// ------------- 二、Express 基础配置 -------------

app.set('view engine', 'ejs')
app.use(express.urlencoded({ extended: true }))

// 静态资源：/static -> public 目录（保持与 header.ejs 一致）
app.use('/static', express.static('public'))

// 所有前端界面集中在 client.ejs 中，由前端根据 pageStatus 切换
app.get('/', (req, res) => {
  res.render('client')
})

// ------------- 三、函数定义 -------------
function handleUserLogin(socket, data) {
  socket.emit('login-response', { result: true, msg: '登录成功' })
}

function handleUserJoin(socket, data) {
  user_map.set(data.username, { username: data.username, socket: socket, pageStatus: 1, room_name: null, drawFlag: false, question: null })
  socket2user.set(socket, data.username)
  online_users.set(data.username, true)
  updateAllUser()
  broadcastLobbyInfo()
}

function updateUser(userEntity) {
  userEntity.socket.emit('update-user', { username: userEntity.username, pageStatus: userEntity.pageStatus, room_name: userEntity.room_name, drawFlag: userEntity.drawFlag, question: userEntity.question })
}

function updateAllUser() {
  for (let [username, userEntity] of user_map.entries()) {
    updateUser(userEntity)
  }
}

function handleCreateRoom(socket, data) {
  let user_name = socket2user.get(socket)
  console.log(user_name + ' create room ' + data.roomName)
  room_map.set(data.roomName, { roomName: data.roomName, admin: user_name, users: [user_name], drawer: null, question_list: [], scores: {} })
  user_map.get(user_name).room_name = data.roomName
  user_map.get(user_name).pageStatus = 2
  broadcastLobbyInfo()
}

function handleJoinRoom(socket, data) {
  const user_name = socket2user.get(socket)

  // Check if room exists
  if (!room_map.has(data.roomName)) {
    // Send error message to user
    const user_entity = user_map.get(user_name)
    if (user_entity && user_entity.socket) {
      user_entity.socket.emit('error', { message: 'Room does not exist' })
    }
    return
  }

  room_map.get(data.roomName).users.push(user_name)
  user_map.get(user_name).room_name = data.roomName
  user_map.get(user_name).pageStatus = 2
  broadcastLobbyInfo()
}

function updateRoomStatus(socket) {
  let username = socket2user.get(socket)
  let user_entity = user_map.get(username)

  // Check if user is in a room
  if (!user_entity || !user_entity.room_name) return

  let room_entity = room_map.get(user_entity.room_name)

  // Check if room exists
  if (!room_entity) return

  let user_list = room_entity.users
  for (let i = 0; i < user_list.length; i++) {
    let user_entity_temp = user_map.get(user_list[i])
    user_entity_temp.socket.emit('update-room', { roomName: room_entity.roomName, admin: room_entity.admin, users: room_entity.users, question_list: room_entity.question_list, scores: room_entity.scores || {} })
  }
}

function chooseDrawer(socket) {
  let username = socket2user.get(socket)
  let room_entity = room_map.get(user_map.get(username).room_name)
  let user_list = room_entity.users
  for (let i = 0; i < user_list.length; i++) {
    let user_entity = user_map.get(user_list[i])
    if (user_entity.drawFlag == false) {
      user_entity.drawFlag = true
      return user_entity.username
    }
  }
  return null
}

function getQuestionListFromAzure() {
  return [
    { id: 1, content: 'Question 1', useFlag: false },
    { id: 2, content: 'Question 2', useFlag: false }
  ]
}

function chooseQuestionFromList(question_list) {
  for (let i = 0; i < question_list.length; i++) {
    if (question_list[i].useFlag == false) {
      question_list[i].useFlag = true
      return question_list[i]
    }
  }
}

function handleStartGame(socket) {
  // Get question list
  let question_list = getQuestionListFromAzure()
  let drawer = chooseDrawer(socket)

  let username = socket2user.get(socket)
  let room_entity = room_map.get(user_map.get(username).room_name)

  room_entity.drawer = drawer
  room_entity.question_list = question_list

  // Reset scores when starting a new game
  room_entity.scores = {}

  let user_list = room_entity.users
  for (let i = 0; i < user_list.length; i++) {
    let user_entity = user_map.get(user_list[i])
    if (user_entity.username == drawer) {
      user_entity.pageStatus = 3
      user_entity.question = chooseQuestionFromList(question_list)
    } else {
      user_entity.pageStatus = 4
    }
  }
}

function handleNextRound(socket) {
  let drawer = chooseDrawer(socket)
  let username = socket2user.get(socket)
  let room_entity = room_map.get(user_map.get(username).room_name)
  let user_list = room_entity.users
  let question_list = room_entity.question_list

  if (drawer != null) {
    room_entity.drawer = drawer
    for (let i = 0; i < user_list.length; i++) {
      let user_entity = user_map.get(user_list[i])
      if (user_entity.username == drawer) {
        user_entity.pageStatus = 3
        user_entity.question = chooseQuestionFromList(question_list)
      } else {
        user_entity.pageStatus = 4
      }
    }
  } else {
    for (let i = 0; i < user_list.length; i++) {
      let user_entity = user_map.get(user_list[i])
      user_entity.pageStatus = 6
    }
  }
}

function handleGameOver(socket) {
  let username = socket2user.get(socket)
  let room_entity = room_map.get(user_map.get(username).room_name)
  let user_list = room_entity.users

  room_entity.drawer = null
  room_entity.question_list = []

  // Ensure all users have scores (assign random scores if none)
  if (!room_entity.scores) {
    room_entity.scores = {}
  }

  for (let i = 0; i < user_list.length; i++) {
    let user_name = user_list[i]
    if (room_entity.scores[user_name] === undefined) {
      // Assign a random score between 10-30 if no score exists
      room_entity.scores[user_name] = Math.floor(Math.random() * 21) + 10
    }

    let user_entity = user_map.get(user_name)
    user_entity.pageStatus = 2
    user_entity.drawFlag = false
    user_entity.question = null
  }

  // Update room status to broadcast final scores
  updateRoomStatus(socket)
}

function handleAdmin(socket, data) {
  switch (data.action) {
    case 'start-game':
      handleStartGame(socket)
      break
    case 'next-round':
      handleNextRound(socket)
      break
    case 'game-over':
      handleGameOver(socket)
      break
    default:
      console.log('Unknown admin action: ' + action)
  }
}

function updateRoomUser(socket) {
  let username = socket2user.get(socket)
  let room_entity = room_map.get(user_map.get(username).room_name)
  let user_list = room_entity.users
  for (let i = 0; i < user_list.length; i++) {
    let user_entity = user_map.get(user_list[i])
    updateUser(user_entity)
  }
}

function broadcastLobbyInfo() {
  // Collect room list
  let roomList = []
  for (let [roomName, roomEntity] of room_map.entries()) {
    roomList.push({
      roomName: roomEntity.roomName,
      admin: roomEntity.admin,
      users: roomEntity.users
    })
  }

  // Collect online users
  let onlineUsers = {}
  for (let [username, isOnline] of online_users.entries()) {
    onlineUsers[username] = { online: isOnline }
  }

  // Broadcast to all users
  for (let [username, userEntity] of user_map.entries()) {
    if (userEntity.socket) {
      userEntity.socket.emit('lobby-info', { roomList: roomList, onlineUsers: onlineUsers })
    }
  }
}

function handleDrawOver(socket) {
  let username = socket2user.get(socket)
  let room_entity = room_map.get(user_map.get(username).room_name)
  let user_list = room_entity.users

  // Ensure all users have scores (assign random scores if none)
  if (!room_entity.scores) {
    room_entity.scores = {}
  }

  for (let i = 0; i < user_list.length; i++) {
    let user_name = user_list[i]
    if (room_entity.scores[user_name] === undefined) {
      // Assign a random score between 10-30 if no score exists
      room_entity.scores[user_name] = Math.floor(Math.random() * 21) + 10
    }

    let user_entity = user_map.get(user_name)
    user_entity.pageStatus = 5
  }

  // Update room status to broadcast scores
  updateRoomStatus(socket)
}

// ------------- 四、Socket.IO 事件 -------------

io.on('connection', (socket) => {
  console.log('New connection', socket.id)

  socket.on('login', (data) => {
    console.log('Login', data)
    handleUserLogin(socket, data)
  })

  socket.on('join', (data) => {
    console.log('Join', data)
    handleUserJoin(socket, data)
  })

  socket.on('createRoom', (data) => {
    console.log('Create Room', data)
    handleCreateRoom(socket, data)
    updateAllUser()
    updateRoomStatus(socket)
  })

  socket.on('join-room', (data) => {
    console.log('Join Room', data)
    handleJoinRoom(socket, data)
    updateAllUser()
    updateRoomStatus(socket)
  })

  socket.on('admin', (data) => {
    console.log('Admin', data)
    handleAdmin(socket, data)
    updateRoomUser(socket)
    updateRoomStatus(socket)
  })

  socket.on('draw-over', () => {
    console.log('Draw Over')
    handleDrawOver(socket)
    updateRoomUser(socket)
  })

  socket.on('draw-data', (data) => {
    // 接收画图数据并转发给房间内其他成员
    const username = socket2user.get(socket)
    if (!username) return

    const user_entity = user_map.get(username)
    if (!user_entity || !user_entity.room_name) return

    const room_entity = room_map.get(user_entity.room_name)
    if (!room_entity) return

    // Handle score updates
    if (data.type === 'score') {
      // Update the room entity's scores
      if (!room_entity.scores) {
        room_entity.scores = {}
      }
      room_entity.scores[data.username] = (room_entity.scores[data.username] || 0) + data.score
      // Update room status to broadcast the new scores
      updateRoomStatus(socket)
    }

    // 转发给房间内其他成员（不包括发送者）
    const user_list = room_entity.users
    for (let i = 0; i < user_list.length; i++) {
      const target_user = user_map.get(user_list[i])
      if (target_user && target_user.username !== username) {
        target_user.socket.emit('draw-data', data)
      }
    }
  })

  socket.on('draw-clear', () => {
    // 接收清除画板事件并转发给房间内其他成员
    const username = socket2user.get(socket)
    if (!username) return

    const user_entity = user_map.get(username)
    if (!user_entity || !user_entity.room_name) return

    const room_entity = room_map.get(user_entity.room_name)
    if (!room_entity) return

    // 转发给房间内其他成员（不包括发送者）
    const user_list = room_entity.users
    for (let i = 0; i < user_list.length; i++) {
      const target_user = user_map.get(user_list[i])
      if (target_user && target_user.username !== username) {
        target_user.socket.emit('canvas-clear')
      }
    }
  })

  socket.on('disconnect', () => {
    const username = socket2user.get(socket)
    if (username) {
      console.log('User disconnected:', username)
      online_users.set(username, false)
      broadcastLobbyInfo()

      // Remove user from room if they were in one
      const user_entity = user_map.get(username)
      if (user_entity && user_entity.room_name) {
        const room_entity = room_map.get(user_entity.room_name)
        if (room_entity) {
          // Remove user from room's user list
          const index = room_entity.users.indexOf(username)
          if (index > -1) {
            room_entity.users.splice(index, 1)
          }

          // If room is now empty, delete it
          if (room_entity.users.length === 0) {
            room_map.delete(user_entity.room_name)
          }

          // Update room status for remaining users
          updateRoomStatus(socket)
        }
      }

      // Remove socket to username mapping
      socket2user.delete(socket)
    }
  })

  socket.on('leave-room', () => {
    const username = socket2user.get(socket)
    if (username) {
      console.log('User left room:', username)

      // Remove user from room if they were in one
      const user_entity = user_map.get(username)
      if (user_entity && user_entity.room_name) {
        const room_entity = room_map.get(user_entity.room_name)
        if (room_entity) {
          // Remove user from room's user list
          const index = room_entity.users.indexOf(username)
          if (index > -1) {
            room_entity.users.splice(index, 1)
          }

          // If room is now empty, delete it
          if (room_entity.users.length === 0) {
            room_map.delete(user_entity.room_name)
          } else {
            // Transfer admin rights if leaving user was admin
            if (room_entity.admin === username) {
              room_entity.admin = room_entity.users[0]
            }
          }

          // Update room status for remaining users
          updateRoomStatus(socket)

          // Update lobby info
          broadcastLobbyInfo()
        }
      }

      // Reset user's room data
      if (user_entity) {
        user_entity.room_name = null
        user_entity.pageStatus = 1 // Back to lobby
        user_entity.drawFlag = false
        user_entity.question = null
        updateUser(user_entity)
      }

      // Broadcast lobby info to all users
      broadcastLobbyInfo()
    }
  })
})

// ------------- 程序启动入口 -------------

function startServer() {
  const PORT = process.env.PORT || 8080
  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`)
  })
}

if (module === require.main) {
  startServer()
}

module.exports = server
