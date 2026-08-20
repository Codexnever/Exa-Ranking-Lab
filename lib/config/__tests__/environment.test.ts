import {getPublicAppwriteConfig,getServerAppwriteConfig,lazyService} from "../environment"

describe("environment configuration",()=>{
  test("separates public and server Appwrite requirements",()=>{
    const env={NEXT_PUBLIC_APPWRITE_ENDPOINT:" https://example.test/v1 ",NEXT_PUBLIC_APPWRITE_PROJECT_ID:"project",NEXT_PUBLIC_APPWRITE_DATABASE_ID:"database",APPWRITE_API_KEY:"secret"}
    expect(getPublicAppwriteConfig(env)).toEqual({endpoint:"https://example.test/v1",projectId:"project",databaseId:"database"})
    expect(getServerAppwriteConfig(env)).toMatchObject({apiKey:"secret"})
  })
  test("reports the exact missing variable without exposing values",()=>{
    expect(()=>getServerAppwriteConfig({})).toThrow("NEXT_PUBLIC_APPWRITE_ENDPOINT")
  })
  test("does not construct lazy external services until first use",()=>{
    const factory=jest.fn(()=>({value:7,read(){return this.value}})),service=lazyService(factory)
    expect(factory).not.toHaveBeenCalled();expect(service.read()).toBe(7);expect(factory).toHaveBeenCalledTimes(1)
  })
})
