const canvas = document.getElementById("gameCanvas")
const ctx = canvas.getContext("2d")

const scoreCanvas = document.getElementById("scoreCanvas")
const scoreCtx = scoreCanvas.getContext("2d")

const feedButton = document.getElementById("feedButton")
const startButton = document.getElementById("startButton")
const startScreen = document.getElementById("startScreen")

const music = document.getElementById("bgMusic")

let score = 0
let highScore = localStorage.getItem("feedMichaelHigh") || 0

let combo = 1
let lastFeed = 0

let shake = 0

let burgerX = -200
let burgerY = 0
let burgerFlying = false

let mouthOpen = false

canvas.width = window.innerWidth
canvas.height = window.innerHeight

scoreCanvas.width = 300
scoreCanvas.height = 80

const img = {}

const ASSETS = {
background:"assets/background.png",
burger:"assets/burger.png",
idle:"assets/michael_idle.png",
open:"assets/michael_open.png",
digits:"assets/digits.png"
}

function loadImage(src){
return new Promise((resolve)=>{
const i = new Image()
i.src = src
i.onload = ()=>resolve(i)
})
}

async function loadAssets(){

for(const key in ASSETS){
img[key] = await loadImage(ASSETS[key])
}

draw()
}

startButton.onclick = ()=>{

startScreen.style.display="none"

music.volume=.4
music.play()

loadAssets()

}

feedButton.onclick = feed

function feed(){

const now = Date.now()

if(now-lastFeed < 1000) combo++
else combo=1

lastFeed = now

score += combo

if(score>highScore){
highScore=score
localStorage.setItem("feedMichaelHigh",highScore)
}

burgerX = canvas.width
burgerY = canvas.height*0.55
burgerFlying = true

mouthOpen = true

shake = 10

setTimeout(()=>{

mouthOpen=false

},200)

}

function drawScore(){

scoreCtx.clearRect(0,0,scoreCanvas.width,scoreCanvas.height)

const s = score.toString()

const digitWidth = img.digits.width/10

for(let i=0;i<s.length;i++){

let n = parseInt(s[i])

scoreCtx.drawImage(
img.digits,
n*digitWidth,
0,
digitWidth,
img.digits.height,
i*40,
0,
40,
80
)

}

}

function updateBurger(){

if(!burgerFlying)return

burgerX -= 30

if(burgerX < canvas.width*0.55){

burgerFlying=false

}

}

function draw(){

requestAnimationFrame(draw)

ctx.clearRect(0,0,canvas.width,canvas.height)

let offsetX = 0
let offsetY = 0

if(shake>0){

offsetX = (Math.random()-.5)*shake
offsetY = (Math.random()-.5)*shake

shake -= .5

}

ctx.drawImage(img.background,0+offsetX,0+offsetY,canvas.width,canvas.height)

const face = mouthOpen ? img.open : img.idle

ctx.drawImage(face,0+offsetX,0+offsetY,canvas.width,canvas.height)

updateBurger()

if(burgerFlying){

ctx.drawImage(img.burger,burgerX,burgerY,120,120)

}

drawScore()

}
