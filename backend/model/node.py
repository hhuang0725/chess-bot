import math

import chess
import numpy as np

from . import utils

class Node():
    def __init__(self, state, encoded, C=2.0, prior=1, parent=None, action_taken=None):
      self.state = state
      self.encoded = encoded

      self.C = C
      self.prior = prior
      self.parent = parent
      self.action_taken = action_taken

      self.children = []
      self.value_sum = 0
      self.visits = 0

    def fully_expanded(self):
      return len(self.children) > 0

    def ucb(self, child):
      if child.visits == 0:
        q_val = 0
      else:
        q_val = 1 - ((child.value_sum / child.visits) + 1) / 2

      return q_val + self.C * child.prior * math.sqrt(self.visits) / (child.visits + 1)

    def select(self):
      best_child = None
      best_ucb = float('-inf')

      for child in self.children:
          ucb = self.ucb(child)

          if ucb > best_ucb:
              best_child = child
              best_ucb = ucb

      return best_child

    def expand(self, policy):
      uciIdx = np.nonzero(policy)[0]
      
      for idx in uciIdx:
        child_state = self.state.copy()

        move = chess.Move.from_uci(utils.idxToUci[idx])

        child_state.push(move)
        encoded_state = utils.encode_state(child_state)

        child = Node(child_state, encoded_state, C=self.C, prior=policy[idx], parent=self, action_taken=move)
        self.children.append(child)

    def backpropagate(self, value):
      cur = self

      while cur is not None:
        cur.visits += 1
        cur.value_sum += value
        value = -value
        cur = cur.parent
