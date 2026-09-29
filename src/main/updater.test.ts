import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('electron-updater', () => ({ default: { autoUpdater: {} } }))

describe('describeUpdateError', () => {
  it('tells someone offline to check their connection, whatever the raw error', async () => {
    const { describeUpdateError } = await import('./updater')
    for (const raw of [
      'getaddrinfo ENOTFOUND github.com',
      'net::ERR_INTERNET_DISCONNECTED',
      'connect ECONNREFUSED 127.0.0.1:8765',
      'net::ERR_CONNECTION_RESET'
    ]) {
      expect(describeUpdateError(raw, 'check'), raw).toMatch(/internet connection/)
    }
  })

  it('names a release with no update metadata rather than blaming the network', async () => {
    const { describeUpdateError } = await import('./updater')
    const raw = 'Cannot find latest.yml in the latest release artifacts (https://github.com/…): HttpError: 404'
    expect(describeUpdateError(raw, 'check')).toMatch(/no release/)
  })

  it('says a damaged download will be retried', async () => {
    const { describeUpdateError } = await import('./updater')
    expect(describeUpdateError('sha512 checksum mismatch, expected x, got y', 'download')).toMatch(/damaged/)
  })

  it('falls back to what was being attempted', async () => {
    const { describeUpdateError } = await import('./updater')
    expect(describeUpdateError('something odd', 'check')).toBe('Could not check for updates.')
    expect(describeUpdateError('something odd', 'download')).toBe('The update could not be downloaded.')
    expect(describeUpdateError('something odd', 'install')).toBe('The update could not be installed.')
  })

  it('reports itself unsupported when unpackaged, instead of throwing', async () => {
    const { checkForUpdates, currentStatus } = await import('./updater')
    expect(currentStatus()).toEqual({ state: 'unsupported' })
    await expect(checkForUpdates()).resolves.toEqual({ state: 'unsupported' })
  })
})
