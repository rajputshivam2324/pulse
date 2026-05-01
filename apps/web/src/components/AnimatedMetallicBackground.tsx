'use client'

import { useEffect, useRef } from 'react'

export default function AnimatedMetallicBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let width = window.innerWidth
    let height = window.innerHeight

    // Create brushed stainless steel texture buffer
    const textureCanvas = document.createElement('canvas')
    const tctx = textureCanvas.getContext('2d')
    
    const generateTexture = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = width
      canvas.height = height
      
      textureCanvas.width = width
      textureCanvas.height = height
      if (!tctx) return
      
      // Base stainless steel core color
      tctx.fillStyle = '#8a9199'
      tctx.fillRect(0, 0, width, height)
      
      // Horizontal grain simulation (thousands of micro-scratches)
      tctx.globalAlpha = 0.06
      tctx.fillStyle = '#ffffff'
      for (let i = 0; i < height * 4; i++) {
        tctx.fillRect(Math.random() * width, Math.random() * height, Math.random() * 150 + 50, Math.random() * 2)
      }
      tctx.fillStyle = '#000000'
      for (let i = 0; i < height * 4; i++) {
        tctx.fillRect(Math.random() * width, Math.random() * height, Math.random() * 150 + 50, Math.random() * 2)
      }
      tctx.globalAlpha = 1.0
    }

    const resize = () => {
      generateTexture()
    }

    window.addEventListener('resize', resize)
    resize()

    let t = 0

    const render = () => {
      t += 0.002 // Slow, premium pan

      // 1. Draw static brushed texture
      ctx.globalCompositeOperation = 'source-over'
      if (textureCanvas.width > 0) {
        ctx.drawImage(textureCanvas, 0, 0)
      } else {
        ctx.fillStyle = '#8a9199'
        ctx.fillRect(0, 0, width, height)
      }

      // 2. Overlay dynamic metallic reflections
      // 'overlay' blends the extreme whites and darks into the grey texture, creating true steel
      ctx.globalCompositeOperation = 'overlay'
      
      const diag = Math.sqrt(width * width + height * height)
      const sweepWidth = diag * 3
      
      ctx.save()
      ctx.translate(width / 2, height / 2)
      // Industrial diagonal sweep angle (approx 20 degrees)
      ctx.rotate(20 * Math.PI / 180)
      
      // Primary High-Contrast Sweep
      // Wrapping offset ensures it loops perfectly
      const xOffset = ((t * 250) % sweepWidth) - sweepWidth / 2
      
      const grad = ctx.createLinearGradient(xOffset, -diag, xOffset + diag * 1.5, diag)
      
      // Stainless steel relies on sharp transitions from blinding white to deep iron black
      grad.addColorStop(0.0, 'rgba(10, 10, 15, 0.8)')
      grad.addColorStop(0.1, 'rgba(255, 255, 255, 0.9)')
      grad.addColorStop(0.15, 'rgba(20, 20, 25, 0.85)') // Knife-edge dark shadow
      grad.addColorStop(0.3, 'rgba(200, 205, 215, 0.4)')
      grad.addColorStop(0.45, 'rgba(255, 255, 255, 0.95)')
      grad.addColorStop(0.5, 'rgba(15, 15, 20, 0.8)')   // Second sharp edge
      grad.addColorStop(0.7, 'rgba(220, 225, 235, 0.5)')
      grad.addColorStop(1.0, 'rgba(10, 10, 15, 0.8)')
      
      ctx.fillStyle = grad
      ctx.fillRect(-diag * 2, -diag * 2, diag * 4, diag * 4)
      
      // Secondary Independent Specular Sheen (Ocean Wave)
      // Increased speed dramatically so the blue wave visibly crashes across the screen!
      const xOffset2 = sweepWidth / 2 - ((t * 450) % sweepWidth)
      const grad2 = ctx.createLinearGradient(xOffset2, -diag, xOffset2 + diag * 0.5, diag)
      grad2.addColorStop(0, 'rgba(100, 200, 255, 0)')
      grad2.addColorStop(0.3, 'rgba(120, 210, 255, 0.4)')
      grad2.addColorStop(0.5, 'rgba(180, 230, 255, 0.85)') // Bright icy blue core
      grad2.addColorStop(0.7, 'rgba(120, 210, 255, 0.4)')
      grad2.addColorStop(1, 'rgba(100, 200, 255, 0)')
      
      ctx.fillStyle = grad2
      ctx.fillRect(-diag * 2, -diag * 2, diag * 4, diag * 4)

      ctx.restore()

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: -2 }}
    />
  )
}
