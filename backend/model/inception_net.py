import torch
import torch.nn as nn
import torchvision as tv

class InceptionNet(nn.Module):  
    class InceptionBlock(nn.Module):
      def __init__(self, in_planes, filters, drop_p=0.05):
        super().__init__()

        self.conv1 = nn.Conv2d(in_planes, filters, kernel_size=1)
        self.se1 = tv.ops.SqueezeExcitation(filters, filters, activation=nn.GELU, scale_activation=nn.Tanh)
        self.conv3 = nn.Conv2d(in_planes, filters, kernel_size=3, padding=1)
        self.se3 = tv.ops.SqueezeExcitation(filters, filters, activation=nn.GELU, scale_activation=nn.Tanh)
        self.conv5 = nn.Conv2d(in_planes, filters, kernel_size=5, padding=2)
        self.se5 = tv.ops.SqueezeExcitation(filters, filters, activation=nn.GELU, scale_activation=nn.Tanh)
        self.drop = nn.Dropout2d(drop_p)
        self.gelu = nn.GELU()

      def forward(self, x):
        c1 = self.se1(self.drop(self.gelu(self.conv1(x))))
        c3 = self.se3(self.drop(self.gelu(self.conv3(x))))
        c5 = self.se5(self.drop(self.gelu(self.conv5(x))))

        return self.gelu(torch.cat((c1, c3, c5), dim=1))
      
    def __init__(self, in_planes, filters, squeeze_channels, n_inc, drop_p=0.05):
      super().__init__()

      self.in_planes = in_planes
      self.filters = filters
      self.squeeze_channels = squeeze_channels
      self.n_inc = n_inc
      self.drop_p = drop_p

      self.start_block = nn.Sequential(
        nn.Conv2d(in_planes, filters, kernel_size=3, padding=1),
        tv.ops.SqueezeExcitation(filters, squeeze_channels)
      )

      self.inc = nn.ModuleList([
        self.InceptionBlock(filters, filters // 3, drop_p=drop_p) for i in range(n_inc)
      ])
      
      self.policy_head = nn.Sequential(
          nn.Conv2d(filters, filters, kernel_size=3, padding=1),
          nn.BatchNorm2d(filters),
          nn.GELU(),
          nn.Conv2d(filters, 80, kernel_size=3, padding=1),
          nn.BatchNorm2d(80),
          nn.GELU(),
          nn.Flatten(),
          nn.Linear(80 * 8 * 8, 1968)
      )

      self.value_head = nn.Sequential(
          nn.Conv2d(filters, 64, kernel_size=3, padding=1),
          nn.BatchNorm2d(64),
          nn.GELU(),
          nn.Conv2d(64, 32, kernel_size=3, padding=1),
          nn.BatchNorm2d(32),
          nn.GELU(),
          nn.Flatten(),
          nn.Linear(32 * 8 * 8, 128),
          nn.GELU(),
          nn.Linear(128, 1),
          nn.Tanh()
      )      
    
    @torch.no_grad()
    def forward(self, x):
      x = self.start_block(x)

      for block in self.inc:
        residual = x
        x = block(x)
        x += residual

      p, v = self.policy_head(x), self.value_head(x)
      
      return p, v
