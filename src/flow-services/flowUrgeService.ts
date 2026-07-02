import mongoose from 'mongoose'
import { TaskInstanceModel } from '../flow-models/TaskInstance.js'
import { notificationService } from './NotificationService.js'

export async function urgeFlowTask(taskId: string, urgedByUserId: string) {
  if (!mongoose.Types.ObjectId.isValid(taskId)) {
    throw new Error('Invalid task id')
  }

  const task = await TaskInstanceModel.findById(taskId)
  if (!task) {
    throw new Error('Task not found')
  }

  if (task.status !== 'pending' && task.status !== 'claimed') {
    throw new Error('Task is not pending')
  }

  const targetUserId = task.assignee ?? task.candidateUsers?.[0]
  if (!targetUserId) {
    throw new Error('No assignee to urge')
  }

  if (targetUserId === urgedByUserId) {
    throw new Error('Cannot urge your own task')
  }

  const notification = await notificationService.sendNotification(targetUserId, 'task_urged', {
    taskId,
    taskName: task.nodeName,
    instanceId: task.instanceId,
  })

  return { taskId, targetUserId, notificationId: notification._id }
}
