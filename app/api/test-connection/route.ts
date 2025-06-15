import { type NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json()

    if (!apiKey) {
      return NextResponse.json(
        { message: 'API key is required' },
        { status: 400 }
      )
    }

    // Test the API key with a simple search
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        query: 'test',
        numResults: 1
      })
    })

    if (response.ok) {
      const data = await response.json()
      return NextResponse.json({ 
        success: true, 
        message: 'API key is valid',
        resultsCount: data.results?.length || 0
      })
    } else {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { 
          success: false, 
          message: 'Invalid API key or API error',
          error: errorData.message || 'Unknown error'
        },
        { status: 400 }
      )
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}