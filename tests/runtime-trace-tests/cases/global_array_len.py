choices = ["rock", "paper", "scissors"]

x = len(choices)

def next_choice(forward):
    global choices
    x = len(choices)

print(x)
next_choice(2)
print(x)
