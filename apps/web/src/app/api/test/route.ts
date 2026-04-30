import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || '')

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json()
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return NextResponse.json({ success: true, payload, secret: process.env.JWT_SECRET })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, secret: process.env.JWT_SECRET })
  }
}
