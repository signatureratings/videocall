var firebaseConfig = {
  apiKey: 'AIzaSyC7cR6Gqc4tphSF6q9VLQGeJZ2Qh4G-ECU',
  authDomain: 'spotify-aea1c.firebaseapp.com',
  projectId: 'spotify-aea1c',
  storageBucket: 'spotify-aea1c.appspot.com',
  messagingSenderId: '680278781927',
  appId: '1:680278781927:web:3c1b08018ad7de1514d742',
  measurementId: 'G-KC3DHVM8WD',
}
// Initialize Firebase
firebase.initializeApp(firebaseConfig)
firebase.analytics()

var firestore = firebase.firestore()

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
}

// Global State
const pc = new RTCPeerConnection(servers)
let peerConnection = null
let localStream = null
let remoteStream = null
let roomDialog = null
let roomId = null

async function init(e) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    })
    const video = document.querySelector('#localvideo')
    const remotevideo = document.querySelector('#remotevideo')
    localStream = stream

    remoteStream = new MediaStream()

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream)
    })

    // Pull tracks from remote stream, add to video stream
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track)
      })
    }
    video.srcObject = stream
    remotevideo.srcObject = remoteStream

    e.target.disabled = true
    document.getElementById('call').disabled = false
    document.getElementById('answer').disabled = false
    //  document.getElementById('hangup').disabled = false
  } catch (e) {
    alert('There is some error')
    console.log(e.message)
  }
}
document.getElementById('start').addEventListener('click', (e) => init(e))
const callButton = document.getElementById('call')
const callInput = document.getElementById('callInput')

callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callDoc = firestore.collection('calls').doc()
  const offerCandidates = callDoc.collection('offerCandidates')
  const answerCandidates = callDoc.collection('answerCandidates')

  callInput.value = callDoc.id

  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON())
  }

  // Create offer
  const offerDescription = await pc.createOffer()
  await pc.setLocalDescription(offerDescription)

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  }

  await callDoc.set({ offer })

  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data()
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer)
      pc.setRemoteDescription(answerDescription)
    }
  })

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data())
        pc.addIceCandidate(candidate)
      }
    })
  })

  document.getElementById('hangup').disabled = false
}
const answerButton = document.getElementById('answer')
// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value
  const callDoc = firestore.collection('calls').doc(callId)
  const answerCandidates = callDoc.collection('answerCandidates')
  const offerCandidates = callDoc.collection('offerCandidates')
  document.getElementById('hangup').disabled = false
  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON())
  }

  const callData = (await callDoc.get()).data()

  const offerDescription = callData.offer
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription))

  const answerDescription = await pc.createAnswer()
  await pc.setLocalDescription(answerDescription)

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  }

  await callDoc.update({ answer })

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change)
      if (change.type === 'added') {
        let data = change.doc.data()
        pc.addIceCandidate(new RTCIceCandidate(data))
      }
    })
  })
}

const hangup = document.getElementById('hangup')
hangup.onclick = function (e) {
  const video = document.querySelector('#localvideo')
  const remotevideo = document.querySelector('#remotevideo')
  video.srcObject = null
  remotevideo.srcObject = null
  e.target.disabled = true
}
