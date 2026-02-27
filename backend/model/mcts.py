import numpy as np
import torch

from .node import Node
from . import utils

class MCTS():
    def __init__(self, model, C=2.0):
      self.model = model
      self.C = C

    @torch.no_grad()
    def search(self, state, searches):
      self.model.eval()

      root = Node(state, utils.encode_state(state), C=self.C)

      for _ in range(searches):
        cur = root

        while cur.fully_expanded():
          cur = cur.select()

        val, terminal = utils.value_and_terminal(cur.state)
        val = -val

        if not terminal:
          device = next(self.model.parameters()).device
          pol, val = self.model(torch.tensor(cur.encoded, device=device).unsqueeze(0))

          pol = pol.squeeze(0).cpu().numpy()
          valid_moves = utils.valid_moves(cur.state)
          pol *= valid_moves
          pol /= np.sum(pol)

          val = val.item()

          cur.expand(pol)

        cur.backpropagate(val)

      max_visits = 0
      best_move = None

      for child in root.children:
        if (child.visits > max_visits):
          max_visits = child.visits
          best_move = child.action_taken
        
      return best_move
