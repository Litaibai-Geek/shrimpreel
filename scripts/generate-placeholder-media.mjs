#!/usr/bin/env node
// 仅供本地/预发测试：生成无第三方素材的抽象桌边场景参考视频。
// 这些抽象视频只能验证上传、队列和服务商调用链，不能作为正式产品素材；生产环境必须换成自有或已获授权的真实表演参考片段。
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { site } from '../src/config/site.ts'

const root = new URL('..', import.meta.url).pathname.replace(/^\\/([A-Za-z]:)/, '$1')
const templateDir = join(root, 'seed', 'templates')
const fixtureDir = join(root, 'tests', 'fixtures')
for (const dir of [templateDir, fixtureDir]) mkdirSync(dir, { recursive: true })

const W = 540
const H = 960

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
}

function deskSessionFilter(seconds) {
  return [
    `gradients=s=${W}x${H}:c0=0xf2e6d8:c1=0x94745e:c2=0x2c2927:n=3:speed=0.004:d=${seconds}:r=24`,
    `drawbox=x=0:y=650:w=${W}:h=310:color=0x241f1b@0.82:t=fill`,
    'drawbox=x=45:y=625:w=450:h=18:color=0x765a42@1:t=fill',
    'drawbox=x=65:y=643:w=18:h=210:color=0x4b392b@1:t=fill',
    'drawbox=x=457:y=643:w=18:h=210:color=0x4b392b@1:t=fill',
    `drawbox=x='${W / 2 - 90}+8*sin(t*1.8)':y='430+6*sin(t*1.8)':w=180:h=220:color=0x2b2522@0.96:t=fill`,
    `drawbox=x='${W / 2 - 45}+8*sin(t*1.8)':y='335+6*sin(t*1.8)':w=90:h=90:color=0xb78d72@1:t=fill`,
    'drawbox=x=370:y=355:w=8:h=270:color=0x1a1a1a@1:t=fill',
    'drawbox=x=345:y=345:w=58:h=16:color=0x1a1a1a@1:t=fill',
    'drawbox=x=330:y=620:w=88:h=10:color=0x1a1a1a@1:t=fill',
    'drawbox=x=110:y=550:w=95:h=70:color=0x191919@1:t=fill',
    'drawbox=x=100:y=620:w=115:h=9:color=0x191919@1:t=fill',
    'drawbox=x=28:y=80:w=8:h=460:color=0xffe2bb@0.14:t=fill',
    'format=yuv420p',
  ].join(',')
}

function video(file, seconds) {
  ffmpeg([
    '-f', 'lavfi', '-i', deskSessionFilter(seconds),
    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file,
  ])
}

// 模板源视频：每个时长档位一段，文件名必须与 site.styles[].sources 一致。
for (const style of site.styles) {
  for (const { id, seconds } of site.durations) {
    video(join(templateDir, style.sources[id]), seconds)
  }
}

// e2e 上传 fixture：抽象头像，仅用于自动化测试，不会作为首页示例展示。
const portrait =
  "geq=r='if(lt(hypot(X-270\\\\,Y-260)\\\\,105)\\\\,40\\\\,if(lt(hypot(X-270\\\\,Y-640)\\\\,230)*lt(Y\\\\,720)*gt(Y\\\\,420)\\\\,40\\\\,200+40*Y/H))'" +
  ":g='if(lt(hypot(X-270\\\\,Y-260)\\\\,105)\\\\,30\\\\,if(lt(hypot(X-270\\\\,Y-640)\\\\,230)*lt(Y\\\\,720)*gt(Y\\\\,420)\\\\,30\\\\,150+60*X/W))'" +
  ":b='if(lt(hypot(X-270\\\\,Y-260)\\\\,105)\\\\,60\\\\,if(lt(hypot(X-270\\\\,Y-640)\\\\,230)*lt(Y\\\\,720)*gt(Y\\\\,420)\\\\,60\\\\,230))'"
ffmpeg(['-f', 'lavfi', '-i', `color=s=540x720:d=1,${portrait}`, '-frames:v', '1', '-q:v', '3', join(fixtureDir, 'photo.jpg')])

console.log('Generated local-only Tiny Desk reference placeholders and the e2e photo fixture.')
