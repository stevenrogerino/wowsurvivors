local _, WS = ...

-- Pools retain frames and small state tables for a run. No frame is created
-- while fighting, which keeps swarm spikes from producing UI garbage.
WS.Pool = {}
WS.Pool.__index = WS.Pool

function WS.Pool:New(createFunc, resetFunc, initialSize)
    local pool = setmetatable({ create = createFunc, reset = resetFunc, free = {}, active = {}, count = 0 }, self)
    for _ = 1, initialSize or 0 do
        pool.free[#pool.free + 1] = createFunc()
    end
    return pool
end

function WS.Pool:Acquire()
    local object = self.free[#self.free]
    if object then
        self.free[#self.free] = nil
    else
        object = self.create()
    end
    self.count = self.count + 1
    self.active[self.count] = object
    object.poolIndex = self.count
    return object
end

function WS.Pool:Release(object)
    local index, last = object.poolIndex, self.active[self.count]
    if not index then return end
    self.active[index] = last
    if last then last.poolIndex = index end
    self.active[self.count] = nil
    self.count = self.count - 1
    object.poolIndex = nil
    if self.reset then self.reset(object) end
    self.free[#self.free + 1] = object
end

function WS.Pool:ReleaseAll()
    while self.count > 0 do self:Release(self.active[self.count]) end
end
