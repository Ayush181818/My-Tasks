import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  Platform,
  StatusBar,
  Modal,
  Dimensions,
  Animated,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import styles from './styles'

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const { width: screenWidth } = Dimensions.get('window');
const STORAGE_KEY = '@MyTasks:tasks';
const PRIORITIES = {
  HIGH: { 
    label: 'High', 
    color: '#FF6B6B', 
    backgroundColor: '#FFE8E8',
    shadowColor: '#FF6B6B',
    emoji: '🔴',
    gradient: ['#FF6B6B', '#FF8E8E']
  },
  MEDIUM: { 
    label: 'Medium', 
    color: '#FFB946', 
    backgroundColor: '#FFF4E6',
    shadowColor: '#FFB946',
    emoji: '🟡',
    gradient: ['#FFB946', '#FFCC73']
  },
  LOW: { 
    label: 'Low', 
    color: '#51CF66', 
    backgroundColor: '#E8F5E8',
    shadowColor: '#51CF66',
    emoji: '🟢',
    gradient: ['#51CF66', '#7DD87F']
  },
};

export default function MyTasksApp() {
  const [tasks, setTasks] = useState([]);
  const [inputText, setInputText] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('MEDIUM');
  const [nextId, setNextId] = useState(1);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editText, setEditText] = useState('');
  const [editPriority, setEditPriority] = useState('MEDIUM');
  const [fadeAnim] = useState(new Animated.Value(0));

  // Load tasks from storage on app start
  useEffect(() => {
    loadTasks();
    requestNotificationPermissions();
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();
  }, []);

  // Save tasks whenever tasks array changes
  useEffect(() => {
    saveTasks();
  }, [tasks]);

  const loadTasks = async () => {
    try {
      const storedTasks = await AsyncStorage.getItem(STORAGE_KEY);
      if (storedTasks) {
        const parsedTasks = JSON.parse(storedTasks);
        setTasks(parsedTasks);
        
        // Find the highest ID to continue sequence
        const maxId = parsedTasks.reduce((max, task) => Math.max(max, task.id), 0);
        setNextId(maxId + 1);

        // Reschedule notifications for incomplete tasks
        parsedTasks.forEach(task => {
          if (!task.completed && !task.notificationId) {
            scheduleNotification(task.id, task.text).then(notificationId => {
              if (notificationId) {
                updateTaskNotificationId(task.id, notificationId);
              }
            });
          }
        });
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
      Alert.alert('Error', 'Failed to load saved tasks');
    }
  };

  const saveTasks = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.error('Error saving tasks:', error);
    }
  };

  const updateTaskNotificationId = (taskId, notificationId) => {
    setTasks(currentTasks => 
      currentTasks.map(task => 
        task.id === taskId ? { ...task, notificationId } : task
      )
    );
  };

  const requestNotificationPermissions = async () => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please enable notifications to receive task reminders.'
      );
    }
  };

  const scheduleNotification = async (taskId, taskText) => {
    try {
      if(Platform.OS === 'web'){
        await showNotification(taskText);
        return null;
      }else{
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Task Reminder ⏰',
          body: `Time to complete: ${taskText}`,
          data: { taskId },
        },
        trigger: {
          seconds: 10, 
        },
      });
      return notificationId;
    } }catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  };

  const cancelNotification = async (notificationId) => {
    if (notificationId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
      } catch (error) {
        console.error('Error canceling notification:', error);
      }
    }
  };

  const addTask = async () => {
    if (inputText.trim() === '') {
      Alert.alert('Error', 'Please enter a task');
      return;
    }

    const newTask = {
      id: nextId,
      text: inputText.trim(),
      completed: false,
      priority: selectedPriority,
      createdAt: new Date().toISOString(),
      notificationId: null,
    };

    // Schedule notification for the new task
    const notificationId = await scheduleNotification(newTask.id, newTask.text);
    newTask.notificationId = notificationId;

    setTasks([...tasks, newTask]);
    setInputText('');
    setSelectedPriority('MEDIUM');
    setNextId(nextId + 1);
  };

  const toggleTaskCompletion = async (taskId) => {
    setTasks(tasks.map(task => {
      if (task.id === taskId) {
        const updatedTask = { ...task, completed: !task.completed };
        
        // Cancel notification if task is being marked as completed
        if (updatedTask.completed && task.notificationId) {
          cancelNotification(task.notificationId);
          updatedTask.notificationId = null;
        }
        // Reschedule notification if task is being marked as incomplete
        else if (!updatedTask.completed && !task.notificationId) {
          scheduleNotification(taskId, task.text).then(notificationId => {
            if (notificationId) {
              updateTaskNotificationId(taskId, notificationId);
            }
          });
        }
        
        return updatedTask;
      }
      return task;
    }));
  };

  const deleteTask = async (taskId) => {
    const taskToDelete = tasks.find(task => task.id === taskId);
    
    // Cancel notification if it exists
    if (taskToDelete && taskToDelete.notificationId) {
      await cancelNotification(taskToDelete.notificationId);
    }
    
    setTasks(tasks.filter(task => task.id !== taskId));
  };

  const confirmDeleteTask = (taskId, taskText) => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${taskText}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteTask(taskId) },
      ]
    );
  };

  const openEditModal = (task) => {
    setEditingTask(task);
    setEditText(task.text);
    setEditPriority(task.priority);
    setEditModalVisible(true);
  };

  const saveEditedTask = async () => {
    if (editText.trim() === '') {
      Alert.alert('Error', 'Please enter a task');
      return;
    }

    const updatedTasks = tasks.map(task => {
      if (task.id === editingTask.id) {
        const updatedTask = {
          ...task,
          text: editText.trim(),
          priority: editPriority,
        };

        // If task text changed and it has a notification, reschedule it
        if (task.text !== editText.trim() && task.notificationId && !task.completed) {
          cancelNotification(task.notificationId);
          scheduleNotification(task.id, editText.trim()).then(notificationId => {
            updateTaskNotificationId(task.id, notificationId);
          });
          updatedTask.notificationId = null; // Will be updated by the async call
        }

        return updatedTask;
      }
      return task;
    });

    setTasks(updatedTasks);
    setEditModalVisible(false);
    setEditingTask(null);
    setEditText('');
    setEditPriority('MEDIUM');
  };

  const cancelEdit = () => {
    setEditModalVisible(false);
    setEditingTask(null);
    setEditText('');
    setEditPriority('MEDIUM');
  };

  const sortTasksByPriority = (tasksToSort) => {
    const priorityOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    return tasksToSort.sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed - b.completed; // Incomplete tasks first
      }
      return priorityOrder[b.priority] - priorityOrder[a.priority]; // High priority first
    });
  };

  const renderPrioritySelector = (currentPriority, onSelect) => (
    <View style={styles.priorityContainer}>
      <Text style={styles.priorityLabel}>Priority Level</Text>
      <View style={styles.priorityButtons}>
        {Object.entries(PRIORITIES).map(([key, priority]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.priorityButton,
              currentPriority === key && styles.selectedPriorityButton,
            ]}
            onPress={() => onSelect(key)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={currentPriority === key ? priority.gradient : ['#FFFFFF', '#F8F9FA']}
              style={styles.priorityGradient}
            >
              <Text style={styles.priorityEmoji}>{priority.emoji}</Text>
              <Text style={[
                styles.priorityText, 
                { color: currentPriority === key ? '#FFFFFF' : priority.color }
              ]}>
                {priority.label}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderTask = ({ item, index }) => (
    <Animated.View 
      style={[
        styles.taskItem, 
        item.completed && styles.completedTask,
        {
          transform: [{
            translateY: fadeAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [50, 0],
            })
          }],
          opacity: fadeAnim,
        }
      ]}
    >
      <View style={[styles.priorityStripe, { backgroundColor: PRIORITIES[item.priority].color }]} />
      
      <TouchableOpacity 
        style={styles.checkboxContainer}
        onPress={() => toggleTaskCompletion(item.id)}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={item.completed ? ['#4ECDC4', '#44A08D'] : ['#FFFFFF', '#F8F9FA']}
          style={[styles.checkbox, item.completed && styles.checkedBox]}
        >
          {item.completed && <Text style={styles.checkmark}>✓</Text>}
        </LinearGradient>
      </TouchableOpacity>
      
      <View style={styles.taskContent}>
        <View style={styles.taskHeader}>
          <Text style={[styles.taskText, item.completed && styles.completedText]} numberOfLines={2}>
            {item.text}
          </Text>
          <View style={[styles.priorityIndicator, { backgroundColor: PRIORITIES[item.priority].backgroundColor }]}>
            <Text style={styles.priorityIndicatorEmoji}>
              {PRIORITIES[item.priority].emoji}
            </Text>
          </View>
        </View>
        <Text style={styles.taskTimestamp}>
          {new Date(item.createdAt).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </Text>
      </View>
      
      <View style={styles.actionsContainer}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.editButton]}
          onPress={() => openEditModal(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.actionButtonText}>✏️</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => confirmDeleteTask(item.id, item.text)}
          activeOpacity={0.7}
        >
          <Text style={styles.actionButtonText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const sortedTasks = sortTasksByPriority([...tasks]);
  const incompleteTasks = tasks.filter(task => !task.completed);
  const completedTasks = tasks.filter(task => task.completed);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Task Manager</Text>
          <Text style={styles.subtitle}>Stay organized, stay productive</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{incompleteTasks.length}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{completedTasks.length}</Text>
              <Text style={styles.statLabel}>Completed</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.inputSection}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="What needs to be done?"
            placeholderTextColor="#9CA3AF"
            multiline={false}
            returnKeyType="done"
            onSubmitEditing={addTask}
          />
          <TouchableOpacity 
            style={styles.addButton} 
            onPress={addTask}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#4ECDC4', '#44A08D']}
              style={styles.addButtonGradient}
            >
              <Text style={styles.addButtonText}>+</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {renderPrioritySelector(selectedPriority, setSelectedPriority)}
      </View>

      <FlatList
        data={sortedTasks}
        renderItem={renderTask}
        keyExtractor={(item) => item.id.toString()}
        style={styles.taskList}
        contentContainerStyle={styles.taskListContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyText}>No tasks yet!</Text>
            <Text style={styles.emptySubtext}>Add your first task above to get started</Text>
          </View>
        }
      />

      {/* Edit Task Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={cancelEdit}
      >
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.modalHeaderGradient}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={cancelEdit} style={styles.modalCancelButton}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Edit Task</Text>
              <View style={styles.modalPlaceholder} />
            </View>
          </LinearGradient>
          
          <View style={styles.modalContent}>
            <View style={styles.modalInputContainer}>
              <Text style={styles.modalInputLabel}>Task Description</Text>
              <TextInput
                style={styles.modalTextInput}
                value={editText}
                onChangeText={setEditText}
                placeholder="Edit your task..."
                placeholderTextColor="#9CA3AF"
                multiline={true}
                autoFocus={true}
              />
            </View>
            
            {renderPrioritySelector(editPriority, setEditPriority)}
            
            <TouchableOpacity 
              style={styles.saveButton} 
              onPress={saveEditedTask}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#4ECDC4', '#44A08D']}
                style={styles.saveButtonGradient}
              >
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          ✨ Tasks sync automatically • 🔔 Smart reminders enabled
        </Text>
      </View>
    </View>
  );
}

